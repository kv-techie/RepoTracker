"""Git repository scanner using GitPython.

Responsibilities:
- Walk user-defined folders for .git repos
- Extract branch, commit history, uncommitted changes, ahead/behind status
- Detect local-only repos (never pushed)
- Detect detached HEAD, broken repos (edge cases per rules §14)
"""

from __future__ import annotations
import os
import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import git
from git.exc import GitCommandError, InvalidGitRepositoryError, NoSuchPathError

from agent.models import (
    CommitRecord,
    FileIntelligence,
    HotspotFile,
    LargeFile,
    ReadmeScore,
    RepoRecord,
    SyncStatus,
)
from agent.resolver import resolve_latest_source
from agent.health import compute_health, compute_momentum, compute_staleness

logger = logging.getLogger(__name__)

_README_NAMES = {"readme.md", "readme.rst", "readme.txt", "readme"}
_README_SECTIONS = {
    "has_installation": ["install", "getting started", "setup", "quick start"],
    "has_usage": ["usage", "example", "how to use", "how to run"],
    "has_license": ["license", "licence"],
}


def _repo_id(path: str) -> str:
    return hashlib.md5(path.encode()).hexdigest()[:16]


def _utc_from_timestamp(ts: float) -> datetime:
    return datetime.fromtimestamp(ts, tz=timezone.utc)


def _latest_file_mtime(repo_path: str) -> Optional[datetime]:
    """Walk the repo directory and return the latest file modification time."""
    latest: Optional[float] = None
    try:
        for root, dirs, files in os.walk(repo_path):
            # Skip .git directory
            dirs[:] = [d for d in dirs if d != ".git"]
            for fname in files:
                fpath = os.path.join(root, fname)
                try:
                    mtime = os.path.getmtime(fpath)
                    if latest is None or mtime > latest:
                        latest = mtime
                except OSError:
                    continue
    except OSError:
        return None
    return _utc_from_timestamp(latest) if latest else None


def _analyze_readme(repo_path: str) -> ReadmeScore:
    """Parse README for quality scoring."""
    readme_path: Optional[Path] = None
    for fname in os.listdir(repo_path):
        if fname.lower() in _README_NAMES:
            readme_path = Path(repo_path) / fname
            break

    if not readme_path:
        return ReadmeScore(
            score=0,
            has_readme=False,
            has_description=False,
            has_installation=False,
            has_usage=False,
            has_license=False,
            missing_sections=["README", "description", "installation", "usage", "license"],
            badge_suggestions=["build-status", "license", "version"],
        )

    try:
        content = readme_path.read_text(encoding="utf-8", errors="ignore").lower()
    except OSError:
        content = ""

    has_desc = len(content) > 100
    has_install = any(kw in content for kw in _README_SECTIONS["has_installation"])
    has_usage = any(kw in content for kw in _README_SECTIONS["has_usage"])
    has_license = any(kw in content for kw in _README_SECTIONS["has_license"])

    score = 20  # just having README = 20
    if has_desc:
        score += 20
    if has_install:
        score += 20
    if has_usage:
        score += 20
    if has_license:
        score += 20

    missing = []
    if not has_desc:
        missing.append("description (< 100 chars)")
    if not has_install:
        missing.append("installation section")
    if not has_usage:
        missing.append("usage section")
    if not has_license:
        missing.append("license section")

    badges = []
    if not has_license:
        badges.append("license")
    if "build" not in content and "ci" not in content:
        badges.append("build-status")
    if "version" not in content:
        badges.append("version")

    return ReadmeScore(
        score=score,
        has_readme=True,
        has_description=has_desc,
        has_installation=has_install,
        has_usage=has_usage,
        has_license=has_license,
        missing_sections=missing,
        badge_suggestions=badges,
    )


def _get_file_intelligence(repo_path: str, commits: list[CommitRecord]) -> FileIntelligence:
    """Basic file-level analytics."""
    total_files = 0
    total_lines = 0
    total_bytes = 0
    large_files: list[LargeFile] = []
    recently_modified: list[str] = []

    cutoff = datetime.now(timezone.utc).timestamp() - (7 * 86_400)

    # Build hotspot map from commits
    hotspot_counts: dict[str, int] = {}

    try:
        for root, dirs, files in os.walk(repo_path):
            dirs[:] = [d for d in dirs if d not in {".git", "node_modules", "__pycache__", ".next"}]
            for fname in files:
                fpath = os.path.join(root, fname)
                rel_path = os.path.relpath(fpath, repo_path)
                try:
                    size = os.path.getsize(fpath)
                    mtime = os.path.getmtime(fpath)
                    total_files += 1
                    total_bytes += size
                    if size > 100_000:
                        large_files.append(LargeFile(path=rel_path, size_bytes=size))
                    if mtime > cutoff:
                        recently_modified.append(rel_path)
                except OSError:
                    continue
    except OSError:
        pass

    # Hotspots from commit messages (approximate — use paths seen in diffs)
    hotspots = [
        HotspotFile(path=p, change_count=c, last_modified=datetime.now(timezone.utc))
        for p, c in sorted(hotspot_counts.items(), key=lambda x: -x[1])[:10]
    ]

    return FileIntelligence(
        total_files=total_files,
        total_lines=total_lines,
        total_tokens=total_bytes // 4,
        large_files=sorted(large_files, key=lambda f: -f.size_bytes)[:10],
        hotspots=hotspots,
        recently_modified=recently_modified[:20],
    )


def _extract_commits(repo: git.Repo, repo_id: str, limit: int = 200) -> list[CommitRecord]:
    records: list[CommitRecord] = []
    try:
        for commit in repo.iter_commits(max_count=limit):
            records.append(
                CommitRecord(
                    sha=commit.hexsha,
                    message=commit.message.strip()[:200],
                    author=str(commit.author),
                    committed_at=_utc_from_timestamp(commit.committed_date),
                    files_changed=len(commit.stats.files),
                    insertions=commit.stats.total.get("insertions", 0),
                    deletions=commit.stats.total.get("deletions", 0),
                    repo_id=repo_id,
                )
            )
    except Exception as exc:
        if "does not exist" in str(exc) or "Reference at" in str(exc):
            logger.debug("Repo %s has no commits yet.", repo_id)
        else:
            logger.warning("Could not extract commits: %s", exc)
    return records


def scan_folder(
    folder_path: str,
    stale_threshold_days: int = 30,
    dead_threshold_days: int = 90,
) -> list[tuple[RepoRecord, list[CommitRecord]]]:
    """
    Recursively walk folder_path, find all git repos.
    Returns list of (RepoRecord, commits).
    """
    results: list[tuple[RepoRecord, list[CommitRecord]]] = []
    folder = Path(folder_path)

    if not folder.exists():
        logger.warning("Watched folder does not exist: %s", folder_path)
        return results

    # Walk up to 3 levels deep looking for .git directories
    for root, dirs, _ in os.walk(folder):
        dirs[:] = [d for d in dirs if d not in {"node_modules", "__pycache__", ".next"}]
        if ".git" in dirs:
            dirs[:] = []  # Don't recurse into git repos
            result = _scan_repo(root, stale_threshold_days, dead_threshold_days)
            if result:
                results.append(result)

    return results


def _scan_repo(
    repo_path: str,
    stale_threshold_days: int,
    dead_threshold_days: int,
) -> Optional[tuple[RepoRecord, list[CommitRecord]]]:
    """Scan a single git repository."""
    repo_id = _repo_id(repo_path)
    name = Path(repo_path).name

    try:
        repo = git.Repo(repo_path)
    except (InvalidGitRepositoryError, NoSuchPathError) as exc:
        logger.warning("Broken repo at %s: %s", repo_path, exc)
        # Return a broken repo record
        broken = RepoRecord(
            id=repo_id,
            name=name,
            local_path=repo_path,
            source_type="local_only",
            latest_source="local_filesystem",
            tags=["broken"],  # truly broken = git repo unreadable
            created_at=datetime.now(timezone.utc).isoformat(),
            updated_at=datetime.now(timezone.utc).isoformat(),
        )
        return (broken, [])

    try:
        # Branch detection (handles detached HEAD)
        try:
            current_branch = repo.active_branch.name
        except TypeError:
            # Detached HEAD
            current_branch = f"detached:{repo.head.commit.hexsha[:7]}"

        default_branch = _get_default_branch(repo)

        # Remote URL
        remote_url: Optional[str] = None
        if repo.remotes:
            try:
                remote_url = repo.remotes[0].url
            except Exception:
                pass

        source_type: str = "local_only" if not remote_url else "hybrid"

        # Timestamps
        last_local_commit_at: Optional[str] = None
        try:
            if not repo.head.is_detached or repo.head.commit:
                ts = _utc_from_timestamp(repo.head.commit.committed_date)
                last_local_commit_at = ts.isoformat()
        except Exception:
            pass

        file_mtime = _latest_file_mtime(repo_path)

        # Sync status
        uncommitted_changes = _count_uncommitted(repo)
        local_ahead, remote_ahead, is_diverged = _get_sync_status(repo, current_branch)

        sync = SyncStatus(
            local_ahead_by=local_ahead,
            remote_ahead_by=remote_ahead,
            is_diverged=is_diverged,
            uncommitted_changes=uncommitted_changes,
        )

        # Hybrid Source Resolver
        from agent.resolver import resolve_latest_source
        latest_source, latest_ts = resolve_latest_source(
            file_mtime,
            datetime.fromisoformat(last_local_commit_at) if last_local_commit_at else None,
            None,  # remote push time populated later via GitHub API
        )

        # Stale branches
        stale_branches = _count_stale_branches(repo, stale_threshold_days)

        # README
        readme = _analyze_readme(repo_path)

        # Commits
        commits = _extract_commits(repo, repo_id)

        # Health scoring
        health = compute_health(
            latest_activity_iso=latest_ts.isoformat() if latest_ts else None,
            uncommitted_changes=uncommitted_changes,
            has_readme=readme.has_readme,
            stale_branch_count=stale_branches,
        )

        # Staleness
        staleness = compute_staleness(
            latest_activity_iso=latest_ts.isoformat() if latest_ts else None,
            stale_threshold_days=stale_threshold_days,
            dead_threshold_days=dead_threshold_days,
        )

        # Momentum (needs commit history split)
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        last_4w = sum(
            1 for c in commits
            if (now - c.committed_at.replace(tzinfo=timezone.utc if c.committed_at.tzinfo is None else c.committed_at.tzinfo)).days <= 28
        )
        prev_4w = sum(
            1 for c in commits
            if 28 < (now - c.committed_at.replace(tzinfo=timezone.utc if c.committed_at.tzinfo is None else c.committed_at.tzinfo)).days <= 56
        )
        momentum = compute_momentum(last_4w, prev_4w)

        # File intelligence
        file_intel = _get_file_intelligence(repo_path, commits)

        # Tags
        # broken = technically invalid git state (detached HEAD, broken remotes)
        # NOT a low health score — a deployed stale repo is stale, not broken
        tags: list[str] = []
        if source_type == "local_only":
            tags.append("local_only")
        if staleness.risk in ("high", "critical"):
            tags.append("stale")
        if local_ahead > 0:
            tags.append("unpushed")
        if current_branch.startswith("detached:"):
            tags.append("broken")
        if staleness.risk in ("low", "moderate"):
            tags.append("active")

        record = RepoRecord(
            id=repo_id,
            name=name,
            local_path=repo_path,
            remote_url=remote_url,
            source_type=source_type,
            latest_source=latest_source,
            current_branch=current_branch,
            default_branch=default_branch,
            last_local_commit_at=last_local_commit_at,
            last_file_modified_at=file_mtime.isoformat() if file_mtime else None,
            latest_activity_at=latest_ts.isoformat() if latest_ts else None,
            sync=sync,
            health=health,
            momentum=momentum,
            staleness=staleness,
            readme=readme,
            file_intelligence=file_intel,
            tags=tags,
            created_at=datetime.now(timezone.utc).isoformat(),
            updated_at=datetime.now(timezone.utc).isoformat(),
        )
        return (record, commits)

    except Exception as exc:
        logger.exception("Unexpected error scanning %s: %s", repo_path, exc)
        return None


def _count_uncommitted(repo: git.Repo) -> int:
    try:
        return len(repo.index.diff(None)) + len(repo.untracked_files)
    except Exception:
        return 0


def _get_sync_status(repo: git.Repo, branch: str) -> tuple[int, int, bool]:
    """Returns (local_ahead, remote_ahead, is_diverged)."""
    if not repo.remotes or branch.startswith("detached:"):
        return (0, 0, False)
    try:
        # Refresh remote refs so comparison reflects actual GitHub state
        try:
            repo.remotes[0].fetch(kill_after_timeout=10)
        except Exception:
            pass  # offline or no permission — compare using cached refs

        remote_branch = f"origin/{branch}"
        if remote_branch not in [str(r) for r in repo.references]:
            return (0, 0, False)
        local_ahead = len(list(repo.iter_commits(f"{remote_branch}..HEAD", max_count=50)))
        remote_ahead = len(list(repo.iter_commits(f"HEAD..{remote_branch}", max_count=50)))
        is_diverged = local_ahead > 0 and remote_ahead > 0
        return (local_ahead, remote_ahead, is_diverged)
    except GitCommandError:
        return (0, 0, False)



def _get_default_branch(repo: git.Repo) -> str:
    for name in ("main", "master", "develop", "dev"):
        if name in [b.name for b in repo.branches]:
            return name
    return "main"


def _count_stale_branches(repo: git.Repo, threshold_days: int) -> int:
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=threshold_days)
    count = 0
    try:
        for branch in repo.branches:
            if branch == repo.active_branch:
                continue
            try:
                ts = _utc_from_timestamp(branch.commit.committed_date)
                if ts < cutoff:
                    count += 1
            except Exception:
                continue
    except Exception:
        pass
    return count
