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
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

from agent.config import config, update_config
from agent.db import (
    init_db,
    get_all_repos,
    get_repo,
    get_commits,
    upsert_repo,
    insert_commits,
    batch_upsert_repos,
    batch_insert_commits,
    insert_file_event,
    record_scan,
    get_last_scan,
)
from agent.models import (
    AgentStatus,
    ConfigUpdateRequest,
    RepoRecord,
    ScanResult,
)
from agent.recruiter import compute_recruiter_score, build_recruiter_prompt
from agent.ai_orchestrator import generate, get_ai_stats
from agent.scanner import scan_folder
from agent.watcher import FileWatcher
from agent.ai import generate_weekly_summary, generate_repo_suggestion, answer_repo_query

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

_watcher = FileWatcher()
_last_scan_result: Optional[ScanResult] = None


async def _run_scan() -> ScanResult:
    """Run a full scan of all watched folders, batching all DB writes."""
    global _last_scan_result
    start = time.monotonic()

    all_repos = []
    all_commits = []

    for folder in config.watched_folders:
        results = await asyncio.to_thread(
            scan_folder,
            folder,
            config.stale_threshold_days,
            config.dead_threshold_days,
        )
        for repo, commits in results:
            all_repos.append(repo)
            all_commits.extend(commits)

    # Single-connection batch writes — avoids 18+ sequential DB opens
    await batch_upsert_repos(config.db_path, all_repos)
    await batch_insert_commits(config.db_path, all_commits)

    duration_ms = int((time.monotonic() - start) * 1000)
    result = ScanResult(
        repos_found=len(all_repos),
        duration_ms=duration_ms,
        scanned_at=datetime.now(timezone.utc),
    )
    await record_scan(config.db_path, result)
    _last_scan_result = result
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
    """Drain the watcher queue and persist events."""
    while True:
        event = await _watcher.get_event()
        if event:
            try:
                await insert_file_event(config.db_path, event)
            except Exception as exc:
                logger.warning("Failed to store file event: %s", exc)
        else:
            await asyncio.sleep(0.5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db(config.db_path)
    logger.info("Database initialised at %s", config.db_path)

    loop = asyncio.get_event_loop()
    _watcher.start(config.watched_folders, loop)

    # Initial scan
    if config.watched_folders:
        asyncio.create_task(_run_scan())

    # Background tasks
    asyncio.create_task(_background_scan_loop())
    asyncio.create_task(_file_event_consumer())

    yield

    # Shutdown
    _watcher.stop()
    logger.info("Agent shutdown complete.")


app = FastAPI(
    title="RepoTracker Agent",
    description="Local agent for hybrid repository observability",
    version="1.0.0",
    lifespan=lifespan,
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
    repos = await get_all_repos(config.db_path)
    last_scan = await get_last_scan(config.db_path)
    return AgentStatus(
        online=True,
        last_scan=last_scan.scanned_at if last_scan else None,
        watching_folders=config.watched_folders,
        db_path=config.db_path,
        repo_count=len(repos),
        ai_enabled=config.ai_enabled,
    )


# ---------------------------------------------------------------------------
# Repos
# ---------------------------------------------------------------------------

@app.get("/repos", response_model=list[RepoRecord])
async def list_repos(
    tag: Optional[str] = None,
    collection: Optional[str] = None,
):
    repos = await get_all_repos(config.db_path)
    if tag:
        repos = [r for r in repos if tag in r.tags]
    if collection:
        repos = [r for r in repos if r.collection == collection]
    return repos


@app.get("/repos/{repo_id}", response_model=RepoRecord)
async def get_repo_detail(repo_id: str):
    repo = await get_repo(config.db_path, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")
    return repo


@app.get("/repos/{repo_id}/commits")
async def list_commits(repo_id: str, limit: int = 100):
    return await get_commits(config.db_path, repo_id, limit)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/repos/{repo_id}/health")
async def get_repo_health(repo_id: str):
    repo = await get_repo(config.db_path, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repo not found")
    return {
        "health": repo.health,
        "momentum": repo.momentum,
        "staleness": repo.staleness,
        "readme": repo.readme,
    }


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
        "agent_port": config.agent_port,
    }


@app.patch("/config")
async def patch_config(body: ConfigUpdateRequest):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    safe_keys = {"watched_folders", "scan_interval_seconds", "stale_threshold_days",
                 "dead_threshold_days", "ai_enabled", "ai_mode", "ollama_model"}
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
    return get_ai_stats()


@app.get("/ai/provider-status")
async def ai_provider_status():
    """Test which AI providers are available and configured."""
    from agent.ai_orchestrator import _ollama_healthy
    gemini_ok = bool(config.gemini_api_key)
    ollama_ok = await _ollama_healthy(config.ollama_model)
    return {
        "gemini": {"configured": gemini_ok, "key_set": gemini_ok},
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
        ollama_model=config.ollama_model
    )
    
    score_data["commentary"] = commentary
    score_data["provider"] = provider
    return score_data

@app.get("/ai/summary")
async def ai_weekly_summary():
    if not config.ai_enabled:
        return {"summary": "", "ai_enabled": False}
    repos = await get_all_repos(config.db_path)
    summaries = [
        {
            "name": r.name,
            "health": r.health.score if r.health else None,
            "staleness_risk": r.staleness.risk if r.staleness else None,
            "commits_7d": 0,  # TODO: aggregate from commits table
        }
        for r in repos
    ]
    summary = await generate_weekly_summary(summaries)
    return {"summary": summary, "ai_enabled": True}


@app.post("/ai/query")
async def ai_query(body: dict):
    question = body.get("question", "")
    if not question:
        raise HTTPException(status_code=400, detail="question is required")
    repos = await get_all_repos(config.db_path)
    repo_dicts = [r.model_dump() for r in repos]
    answer = await answer_repo_query(question, repo_dicts)
    return {"answer": answer}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("agent.main:app", host="127.0.0.1", port=config.agent_port, reload=True)
