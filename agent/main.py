"""RepoTracker Local Agent — FastAPI entry point.

Run with:
  python -m uvicorn agent.main:app --port 8001 --reload

Or directly:
  python agent/main.py
"""

from __future__ import annotations
import sys
import os

# Allow running `python main.py` directly from inside the agent folder
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import asyncio
import logging
import secrets
import socket
import time
from contextlib import asynccontextmanager
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends, Header
from fastapi.middleware.cors import CORSMiddleware

from agent.config import config, update_config
from agent.db import (
    init_db,
    get_all_repos,
    get_repo,
    get_commits,
    batch_upsert_repos,
    batch_insert_commits,
    record_scan,
    get_last_scan,
    reconcile_missing_repos,
    get_commit_counts_since,
    get_commit_activity,
    get_known_shas,
    get_known_shas_for,
    prune_health_history,
    count_repos,
    query_repos,
    get_commit_times,
    record_ai_request,
    get_ai_usage,
    set_repo_user_state,
    get_deployed_repo_ids,
    record_health,
    get_health_history,
)
from agent.models import (
    AgentStatus,
    ConfigUpdateRequest,
    RepoRecord,
    RepoUserUpdate,
    ScanResult,
)
from agent.recruiter import compute_recruiter_score, build_recruiter_prompt
from agent.ai_orchestrator import generate, get_ai_stats
from agent.scanner import scan_folder, _scan_repo
from agent.watcher import FileWatcher
from agent.ai import generate_weekly_summary, answer_repo_query

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

_watcher = FileWatcher()


# Watcher debounce: rescan a repo once its files have been quiet this long,
# and never more often than the minimum gap
RESCAN_QUIET_SECONDS = 5
RESCAN_MIN_GAP_SECONDS = 30
_pending_rescans: dict[str, float] = {}   # repo root -> last event (monotonic)
_last_rescan: dict[str, float] = {}       # repo root -> last rescan (monotonic)
_scan_lock = asyncio.Lock()


def _github_reachable(timeout: float = 2.0) -> bool:
    try:
        with socket.create_connection(("github.com", 443), timeout=timeout):
            return True
    except OSError:
        return False


async def _run_scan() -> ScanResult:
    """Run a full scan of all watched folders, batching all DB writes."""
    async with _scan_lock:
        return await _run_scan_locked()


async def _run_scan_locked() -> ScanResult:
    start = time.monotonic()

    all_repos = []
    all_commits = []

    known_shas = await get_known_shas(config.db_path)
    deployed_ids = await get_deployed_repo_ids(config.db_path)
    allow_fetch = config.auto_fetch and await asyncio.to_thread(_github_reachable)

    for folder in config.watched_folders:
        results = await asyncio.to_thread(
            scan_folder,
            folder,
            config.stale_threshold_days,
            config.dead_threshold_days,
            known_shas,
            allow_fetch,
            config.fetch_interval_minutes * 60,
            deployed_ids,
        )
        for repo, commits in results:
            all_repos.append(repo)
            all_commits.extend(commits)

    # Single-connection batch writes — avoids 18+ sequential DB opens
    await batch_upsert_repos(config.db_path, all_repos)
    await batch_insert_commits(config.db_path, all_commits)
    for repo in all_repos:
        if repo.health:
            await record_health(config.db_path, repo.id, repo.health)
    marked, deleted = await reconcile_missing_repos(config.db_path, {r.id for r in all_repos})
    if marked or deleted:
        logger.info("Repos no longer on disk: %d marked missing, %d removed", marked, deleted)
    await prune_health_history(config.db_path)

    duration_ms = int((time.monotonic() - start) * 1000)
    result = ScanResult(
        repos_found=len(all_repos),
        duration_ms=duration_ms,
        scanned_at=datetime.now(timezone.utc),
    )
    await record_scan(config.db_path, result)
    logger.info("Scan complete: %d repos in %dms", len(all_repos), duration_ms)
    return result


async def _background_scan_loop():
    """Periodic background scan."""
    while True:
        try:
            await _run_scan()
        except Exception as exc:
            logger.exception("Background scan failed: %s", exc)
        await asyncio.sleep(config.scan_interval_seconds)


async def _file_event_consumer():
    """Drain the watcher queue, persist events, and queue the repo for a debounced rescan."""
    while True:
        event = await _watcher.next_event()
        # Events drive the debounced rescan and nothing else. They are deliberately not
        # persisted: writing them to SQLite made the agent's own database file change, which
        # produced another event — two million rows and 2.8 GB before the loop was noticed.
        if event.repo_root:
            _pending_rescans[event.repo_root] = time.monotonic()


async def rescan_repo(repo_root: str) -> bool:
    """Re-scan one repo and store it. Returns False if the path is no longer a readable repo."""
    repo_id = _repo_id_for(repo_root)
    known = await get_known_shas_for(config.db_path, repo_id)
    deployed_ids = await get_deployed_repo_ids(config.db_path)
    async with _scan_lock:
        result = await asyncio.to_thread(
            _scan_repo,
            repo_root,
            config.stale_threshold_days,
            config.dead_threshold_days,
            known,
            False,  # never fetch on a file save
            3600,
            repo_id in deployed_ids,
        )
        if not result:
            return False
        record, commits = result
        await batch_upsert_repos(config.db_path, [record])
        await batch_insert_commits(config.db_path, commits)
    return True


def _repo_id_for(repo_root: str) -> str:
    from agent.scanner import _repo_id
    return _repo_id(repo_root)


async def _debounced_rescan_loop():
    """Rescan repos whose files changed, once they have been quiet for a few seconds."""
    while True:
        await asyncio.sleep(1)
        now = time.monotonic()
        due = [
            root for root, last_event in _pending_rescans.items()
            if now - last_event >= RESCAN_QUIET_SECONDS
            and now - _last_rescan.get(root, float("-inf")) >= RESCAN_MIN_GAP_SECONDS
        ]
        for root in due:
            _pending_rescans.pop(root, None)
            _last_rescan[root] = now
            try:
                await rescan_repo(root)
                logger.info("Rescanned after file changes: %s", Path(root).name)
            except Exception as exc:
                logger.warning("Rescan failed for %s: %s", root, exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db(config.db_path)
    logger.info("Database initialised at %s", config.db_path)

    loop = asyncio.get_event_loop()
    _watcher.start(config.watched_folders, loop)

    # Background tasks (the scan loop runs its first scan immediately)
    asyncio.create_task(_background_scan_loop())
    asyncio.create_task(_file_event_consumer())
    asyncio.create_task(_debounced_rescan_loop())

    yield

    # Shutdown
    _watcher.stop()
    logger.info("Agent shutdown complete.")


async def require_agent_token(x_agent_token: Optional[str] = Header(default=None)) -> None:
    """Reject any caller that does not present the token stored in agent/.env."""
    if not x_agent_token or not secrets.compare_digest(x_agent_token, config.agent_token):
        raise HTTPException(status_code=401, detail="Missing or invalid X-Agent-Token")


app = FastAPI(
    title="RepoTracker Agent",
    description="Local agent for hybrid repository observability",
    version="1.0.0",
    lifespan=lifespan,
    dependencies=[Depends(require_agent_token)],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

@app.get("/status", response_model=AgentStatus)
async def get_status():
    repo_count = await count_repos(config.db_path)
    last_scan = await get_last_scan(config.db_path)
    return AgentStatus(
        online=True,
        last_scan=last_scan.scanned_at if last_scan else None,
        watching_folders=config.watched_folders,
        watching_folder_count=len(config.watched_folders),
        db_path=config.db_path,
        repo_count=repo_count,
        ai_enabled=config.ai_enabled,
    )


# ---------------------------------------------------------------------------
# Repos
# ---------------------------------------------------------------------------

@app.get("/repos", response_model=list[RepoRecord])
async def list_repos(
    tag: Optional[str] = None,
    collection: Optional[str] = None,
    limit: Optional[int] = None,
    offset: int = 0,
):
    return await query_repos(config.db_path, tag=tag, collection=collection, limit=limit, offset=offset)


@app.get("/repos/{repo_id}", response_model=RepoRecord)
async def get_repo_detail(repo_id: str):
    repo = await get_repo(config.db_path, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")
    return repo


@app.patch("/repos/{repo_id}", response_model=RepoRecord)
async def update_repo_user_state(repo_id: str, body: RepoUserUpdate):
    """Set the repo's collection or deployed flag. Rescans keep both."""
    repo = await set_repo_user_state(
        config.db_path,
        repo_id,
        collection=body.collection,
        clear_collection=body.clear_collection,
        deployed=body.deployed,
    )
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")

    # Marking a repo deployed changes how it scores, so re-score it now rather than
    # leaving stale numbers on screen until the next scan
    if body.deployed is not None and repo.local_path:
        await rescan_repo(repo.local_path)
        repo = await get_repo(config.db_path, repo_id) or repo

    return repo


@app.get("/repos/{repo_id}/commits")
async def list_commits(repo_id: str, limit: int = 100):
    return await get_commits(config.db_path, repo_id, limit)


@app.get("/insights/commits")
async def insight_commits(years: Optional[int] = None):
    """Commit timestamps across every tracked repo, de-duplicated by SHA.

    Times are returned raw because the browser buckets them by the viewer's local day;
    doing that in SQL would need a fixed UTC offset and would be wrong across DST.
    """
    since = datetime.now(timezone.utc) - timedelta(days=365 * years) if years else None
    return {"commits": await get_commit_times(config.db_path, since)}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/repos/{repo_id}/health")
async def get_repo_health(repo_id: str):
    repo = await get_repo(config.db_path, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")
    history = await get_health_history(config.db_path, repo_id)
    return {
        "health": repo.health,
        "momentum": repo.momentum,
        "staleness": repo.staleness,
        "readme": repo.readme,
        "history": history,
        "changes": _explain_health_change(history),
    }


def _explain_health_change(history: list[dict]) -> list[str]:
    """Why the score moved between the last two snapshots, factor by factor."""
    if len(history) < 2:
        return []
    current, previous = history[0], history[1]
    labels = {
        "commit_recency_bonus": "recent activity",
        "readme_bonus": "README",
        "clean_branches_bonus": "clean branches",
        "stale_branch_penalty": "stale branches",
        "uncommitted_penalty": "uncommitted files",
        "no_activity_penalty": "inactivity",
    }
    changes = []
    for key, label in labels.items():
        delta = current["breakdown"].get(key, 0) - previous["breakdown"].get(key, 0)
        if delta:
            changes.append(f"{'+' if delta > 0 else ''}{delta} from {label}")
    total = current["score"] - previous["score"]
    if total and not changes:
        changes.append(f"{'+' if total > 0 else ''}{total} overall")
    return changes


# ---------------------------------------------------------------------------
# Scan
# ---------------------------------------------------------------------------

@app.post("/scan")
async def trigger_scan(background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_scan)
    return {"message": "Scan triggered"}


@app.get("/scan/last")
async def last_scan():
    result = await get_last_scan(config.db_path)
    return result


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

@app.get("/config")
async def get_config():
    return {
        "watched_folders": config.watched_folders,
        "scan_interval_seconds": config.scan_interval_seconds,
        "stale_threshold_days": config.stale_threshold_days,
        "dead_threshold_days": config.dead_threshold_days,
        "ai_enabled": config.ai_enabled,
        "ai_mode": config.ai_mode,
        "gemini_key_set": bool(config.gemini_api_key),
        "ollama_model": config.ollama_model,
        "gemini_model": config.gemini_model,
        "agent_port": config.agent_port,
        "auto_fetch": config.auto_fetch,
        "fetch_interval_minutes": config.fetch_interval_minutes,
    }


@app.patch("/config")
async def patch_config(body: ConfigUpdateRequest):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    safe_keys = {"watched_folders", "scan_interval_seconds", "stale_threshold_days",
                 "dead_threshold_days", "ai_enabled", "ai_mode", "ollama_model",
                 "auto_fetch", "fetch_interval_minutes", "gemini_model"}
    new_cfg = update_config(updates)
    if "watched_folders" in updates:
        _watcher.update_folders(new_cfg.watched_folders)
    result = {k: getattr(new_cfg, k) for k in safe_keys}
    result["gemini_key_set"] = bool(new_cfg.gemini_api_key)
    return result


# ---------------------------------------------------------------------------
# AI & Recruiter Lens
# ---------------------------------------------------------------------------

@app.get("/ai/stats")
async def ai_stats():
    """Persisted request counts. The in-memory figures are only for the current process."""
    stored = await get_ai_usage(config.db_path)
    stored["since_restart"] = get_ai_stats()
    return stored


@app.get("/ai/provider-status")
async def ai_provider_status():
    """Test which AI providers actually answer, not just which keys are set."""
    from agent.ai_orchestrator import _ollama_healthy, gemini_reachable
    gemini_ok, gemini_detail = await gemini_reachable(config.gemini_api_key, config.gemini_model)
    ollama_ok = await _ollama_healthy(config.ollama_model)
    return {
        "gemini": {
            "configured": gemini_ok,
            "key_set": bool(config.gemini_api_key),
            "model": config.gemini_model,
            "detail": gemini_detail,
        },
        "ollama": {"available": ollama_ok, "model": config.ollama_model},
        "active_mode": config.ai_mode,
        "ai_enabled": config.ai_enabled,
    }

@app.get("/repos/{repo_id}/recruiter")
async def get_recruiter_lens(repo_id: str, skip_ai: bool = False):
    repo = await get_repo(config.db_path, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")
        
    repo_dict = repo.model_dump()
    score_data = compute_recruiter_score(repo_dict)
    
    if skip_ai or not config.ai_enabled or config.ai_mode == "disabled":
        # Graceful degradation — return rule-based score only
        score_data["commentary"] = ""
        score_data["provider"] = "local"
        return score_data
        
    prompt = build_recruiter_prompt(repo_dict, score_data)
    commentary, provider = await generate(
        prompt,
        ai_mode=config.ai_mode,
        gemini_api_key=config.gemini_api_key,
        ollama_model=config.ollama_model,
        gemini_model=config.gemini_model,
    )
    
    await record_ai_request(config.db_path, provider)
    score_data["commentary"] = commentary
    score_data["provider"] = provider
    return score_data

@app.get("/ai/summary")
async def ai_weekly_summary():
    if not config.ai_enabled:
        return {"summary": "", "ai_enabled": False}
    repos = await get_all_repos(config.db_path)
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    commits_7d = await get_commit_counts_since(config.db_path, week_ago)
    summaries = [
        {
            "name": r.name,
            "health": r.health.score if r.health else None,
            "staleness_risk": r.staleness.risk if r.staleness else None,
            "commits_7d": commits_7d.get(r.id, 0),
        }
        for r in repos
    ]
    summary, provider = await generate_weekly_summary(summaries)
    await record_ai_request(config.db_path, provider)
    return {"summary": summary, "ai_enabled": True, "provider": provider}


@app.post("/ai/query")
async def ai_query(body: dict):
    question = body.get("question", "")
    if not question:
        raise HTTPException(status_code=400, detail="question is required")
    repos = await get_all_repos(config.db_path)
    repo_dicts = [r.model_dump() for r in repos]
    answer, provider = await answer_repo_query(question, repo_dicts)
    await record_ai_request(config.db_path, provider)
    return {"answer": answer, "provider": provider}


if __name__ == "__main__":
    import uvicorn
    # Auto-reload only for development (RT_DEV_RELOAD=1). As a background daemon, reload
    # watches the whole project, restarts on SQLite/OneDrive churn and can orphan workers.
    dev_reload = os.environ.get("RT_DEV_RELOAD") == "1"
    uvicorn.run(
        "agent.main:app",
        host="127.0.0.1",
        port=config.agent_port,
        reload=dev_reload,
        reload_dirs=[os.path.dirname(__file__)] if dev_reload else None,
    )
