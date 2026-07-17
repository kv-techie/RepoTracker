"""SQLite persistence layer using aiosqlite.

Schema:
  repos        — repo snapshots with all computed fields
  commits      — individual commit records per repo
  file_events  — watchdog filesystem events
  scan_history — audit log of every agent scan
"""

from __future__ import annotations
import json
import aiosqlite
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from agent.models import RepoRecord, CommitRecord, FileEvent, ScanResult


_CREATE_REPOS = """
CREATE TABLE IF NOT EXISTS repos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    local_path TEXT,
    remote_url TEXT,
    source_type TEXT NOT NULL DEFAULT 'local_only',
    latest_source TEXT NOT NULL DEFAULT 'local_filesystem',
    current_branch TEXT DEFAULT 'main',
    default_branch TEXT DEFAULT 'main',
    is_private INTEGER DEFAULT 0,
    description TEXT,
    language TEXT,
    topics TEXT DEFAULT '[]',
    last_local_commit_at TEXT,
    last_remote_push_at TEXT,
    last_file_modified_at TEXT,
    latest_activity_at TEXT,
    sync_json TEXT DEFAULT '{}',
    health_json TEXT,
    momentum_json TEXT,
    staleness_json TEXT,
    readme_json TEXT,
    file_intelligence_json TEXT,
    tags TEXT DEFAULT '[]',
    collection TEXT,
    github_stars INTEGER DEFAULT 0,
    github_forks INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""

_CREATE_COMMITS = """
CREATE TABLE IF NOT EXISTS commits (
    id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL,
    sha TEXT NOT NULL,
    message TEXT,
    author TEXT,
    committed_at TEXT NOT NULL,
    files_changed INTEGER DEFAULT 0,
    insertions INTEGER DEFAULT 0,
    deletions INTEGER DEFAULT 0,
    FOREIGN KEY (repo_id) REFERENCES repos(id)
)
"""

_CREATE_FILE_EVENTS = """
CREATE TABLE IF NOT EXISTS file_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    event_type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    FOREIGN KEY (repo_id) REFERENCES repos(id)
)
"""

_CREATE_SCAN_HISTORY = """
CREATE TABLE IF NOT EXISTS scan_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repos_found INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    scanned_at TEXT NOT NULL
)
"""


async def init_db(db_path: str) -> None:
    """Create tables if they don't exist."""
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(db_path) as db:
        await db.execute(_CREATE_REPOS)
        await db.execute(_CREATE_COMMITS)
        await db.execute(_CREATE_FILE_EVENTS)
        await db.execute(_CREATE_SCAN_HISTORY)
        await db.commit()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _repo_to_row(r: RepoRecord) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "local_path": r.local_path,
        "remote_url": r.remote_url,
        "source_type": r.source_type,
        "latest_source": r.latest_source,
        "current_branch": r.current_branch,
        "default_branch": r.default_branch,
        "is_private": int(r.is_private),
        "description": r.description,
        "language": r.language,
        "topics": json.dumps(r.topics),
        "last_local_commit_at": r.last_local_commit_at,
        "last_remote_push_at": r.last_remote_push_at,
        "last_file_modified_at": r.last_file_modified_at,
        "latest_activity_at": r.latest_activity_at,
        "sync_json": r.sync.model_dump_json(),
        "health_json": r.health.model_dump_json() if r.health else None,
        "momentum_json": r.momentum.model_dump_json() if r.momentum else None,
        "staleness_json": r.staleness.model_dump_json() if r.staleness else None,
        "readme_json": r.readme.model_dump_json() if r.readme else None,
        "file_intelligence_json": r.file_intelligence.model_dump_json() if r.file_intelligence else None,
        "tags": json.dumps(r.tags),
        "collection": r.collection,
        "github_stars": r.github_stars,
        "github_forks": r.github_forks,
        "created_at": r.created_at or _now(),
        "updated_at": _now(),
    }


def _row_to_repo(row: aiosqlite.Row) -> RepoRecord:
    from agent.models import SyncStatus, HealthScore, MomentumScore, StalenessInfo, ReadmeScore, FileIntelligence

    d = dict(row)
    return RepoRecord(
        id=d["id"],
        name=d["name"],
        local_path=d.get("local_path"),
        remote_url=d.get("remote_url"),
        source_type=d.get("source_type", "local_only"),
        latest_source=d.get("latest_source", "local_filesystem"),
        current_branch=d.get("current_branch", "main"),
        default_branch=d.get("default_branch", "main"),
        is_private=bool(d.get("is_private", 0)),
        description=d.get("description"),
        language=d.get("language"),
        topics=json.loads(d.get("topics") or "[]"),
        last_local_commit_at=d.get("last_local_commit_at"),
        last_remote_push_at=d.get("last_remote_push_at"),
        last_file_modified_at=d.get("last_file_modified_at"),
        latest_activity_at=d.get("latest_activity_at"),
        sync=SyncStatus.model_validate_json(d.get("sync_json") or "{}"),
        health=HealthScore.model_validate_json(d["health_json"]) if d.get("health_json") else None,
        momentum=MomentumScore.model_validate_json(d["momentum_json"]) if d.get("momentum_json") else None,
        staleness=StalenessInfo.model_validate_json(d["staleness_json"]) if d.get("staleness_json") else None,
        readme=ReadmeScore.model_validate_json(d["readme_json"]) if d.get("readme_json") else None,
        file_intelligence=FileIntelligence.model_validate_json(d["file_intelligence_json"]) if d.get("file_intelligence_json") else None,
        tags=json.loads(d.get("tags") or "[]"),
        collection=d.get("collection"),
        github_stars=d.get("github_stars", 0),
        github_forks=d.get("github_forks", 0),
        created_at=d.get("created_at", ""),
        updated_at=d.get("updated_at", ""),
    )


async def upsert_repo(db_path: str, repo: RepoRecord) -> None:
    row = _repo_to_row(repo)
    cols = ", ".join(row.keys())
    placeholders = ", ".join(f":{k}" for k in row.keys())
    updates = ", ".join(f"{k}=excluded.{k}" for k in row.keys() if k != "id")
    sql = f"""
        INSERT INTO repos ({cols}) VALUES ({placeholders})
        ON CONFLICT(id) DO UPDATE SET {updates}
    """
    async with aiosqlite.connect(db_path) as db:
        await db.execute(sql, row)
        await db.commit()


async def batch_upsert_repos(db_path: str, repos: list[RepoRecord]) -> None:
    """Upsert all repos in a single connection — far faster than one conn per repo."""
    if not repos:
        return
    row0 = _repo_to_row(repos[0])
    cols = ", ".join(row0.keys())
    placeholders = ", ".join(f":{k}" for k in row0.keys())
    updates = ", ".join(f"{k}=excluded.{k}" for k in row0.keys() if k != "id")
    sql = f"""
        INSERT INTO repos ({cols}) VALUES ({placeholders})
        ON CONFLICT(id) DO UPDATE SET {updates}
    """
    async with aiosqlite.connect(db_path) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        for repo in repos:
            await db.execute(sql, _repo_to_row(repo))
        await db.commit()


async def get_all_repos(db_path: str) -> list[RepoRecord]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM repos ORDER BY latest_activity_at DESC") as cursor:
            rows = await cursor.fetchall()
    return [_row_to_repo(r) for r in rows]


async def get_repo(db_path: str, repo_id: str) -> Optional[RepoRecord]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM repos WHERE id=?", (repo_id,)) as cursor:
            row = await cursor.fetchone()
    return _row_to_repo(row) if row else None


async def batch_insert_commits(db_path: str, all_commits: list[CommitRecord]) -> None:
    """Insert all commits from a full scan in a single connection."""
    if not all_commits:
        return
    async with aiosqlite.connect(db_path) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.executemany(
            """INSERT OR IGNORE INTO commits
               (id, repo_id, sha, message, author, committed_at, files_changed, insertions, deletions)
               VALUES (:id, :repo_id, :sha, :message, :author, :committed_at, :files_changed, :insertions, :deletions)""",
            [
                {
                    "id": f"{c.repo_id}:{c.sha}",
                    "repo_id": c.repo_id,
                    "sha": c.sha,
                    "message": c.message,
                    "author": c.author,
                    "committed_at": c.committed_at.isoformat(),
                    "files_changed": c.files_changed,
                    "insertions": c.insertions,
                    "deletions": c.deletions,
                }
                for c in all_commits
            ],
        )
        await db.commit()


async def insert_commits(db_path: str, commits: list[CommitRecord]) -> None:
    if not commits:
        return
    async with aiosqlite.connect(db_path) as db:
        await db.executemany(
            """INSERT OR IGNORE INTO commits
               (id, repo_id, sha, message, author, committed_at, files_changed, insertions, deletions)
               VALUES (:id, :repo_id, :sha, :message, :author, :committed_at, :files_changed, :insertions, :deletions)""",
            [
                {
                    "id": f"{c.repo_id}:{c.sha}",
                    "repo_id": c.repo_id,
                    "sha": c.sha,
                    "message": c.message,
                    "author": c.author,
                    "committed_at": c.committed_at.isoformat(),
                    "files_changed": c.files_changed,
                    "insertions": c.insertions,
                    "deletions": c.deletions,
                }
                for c in commits
            ],
        )
        await db.commit()


async def get_commits(db_path: str, repo_id: str, limit: int = 100) -> list[CommitRecord]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM commits WHERE repo_id=? ORDER BY committed_at DESC LIMIT ?",
            (repo_id, limit),
        ) as cursor:
            rows = await cursor.fetchall()
    return [
        CommitRecord(
            sha=r["sha"],
            message=r["message"] or "",
            author=r["author"] or "",
            committed_at=datetime.fromisoformat(r["committed_at"]),
            files_changed=r["files_changed"],
            insertions=r["insertions"],
            deletions=r["deletions"],
            repo_id=r["repo_id"],
        )
        for r in rows
    ]


async def insert_file_event(db_path: str, event: FileEvent) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT INTO file_events (repo_id, file_path, event_type, occurred_at) VALUES (?,?,?,?)",
            (event.repo_id, event.file_path, event.event_type, event.occurred_at.isoformat()),
        )
        await db.commit()


async def record_scan(db_path: str, result: ScanResult) -> None:
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            "INSERT INTO scan_history (repos_found, duration_ms, scanned_at) VALUES (?,?,?)",
            (result.repos_found, result.duration_ms, result.scanned_at.isoformat()),
        )
        await db.commit()


async def get_last_scan(db_path: str) -> Optional[ScanResult]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM scan_history ORDER BY scanned_at DESC LIMIT 1"
        ) as cursor:
            row = await cursor.fetchone()
    if not row:
        return None
    return ScanResult(
        repos_found=row["repos_found"],
        duration_ms=row["duration_ms"],
        scanned_at=datetime.fromisoformat(row["scanned_at"]),
    )


async def get_commit_counts_by_week(db_path: str, repo_id: str, weeks: int = 8) -> list[int]:
    """Returns list of commit counts per week, oldest first."""
    sql = """
        SELECT strftime('%Y-%W', committed_at) as week, COUNT(*) as cnt
        FROM commits
        WHERE repo_id=?
          AND committed_at >= datetime('now', ?)
        GROUP BY week
        ORDER BY week ASC
    """
    offset = f"-{weeks * 7} days"
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(sql, (repo_id, offset)) as cursor:
            rows = await cursor.fetchall()
    return [r["cnt"] for r in rows]
