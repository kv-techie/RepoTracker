"""SQLite persistence layer using aiosqlite.

Schema:
  repos        — repo snapshots with all computed fields
  commits      — individual commit records per repo
  scan_history — audit log of every agent scan
"""

from __future__ import annotations
import json
import aiosqlite
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from agent.models import RepoRecord, CommitRecord, ScanResult


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

_CREATE_HEALTH_HISTORY = """
CREATE TABLE IF NOT EXISTS health_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    score INTEGER NOT NULL,
    level TEXT NOT NULL,
    breakdown_json TEXT NOT NULL,
    FOREIGN KEY (repo_id) REFERENCES repos(id)
)
"""

_CREATE_AI_USAGE = """
CREATE TABLE IF NOT EXISTS ai_usage (
    provider TEXT NOT NULL,
    day TEXT NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (provider, day)
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


# Columns added after the first release. Existing databases are migrated in place.
_ADDED_REPO_COLUMNS = {
    # Tags the user set (e.g. "deployed"). Scans never overwrite these.
    "user_tags": "TEXT DEFAULT '[]'",
}


_CREATE_INDEXES = (
    # Commits are read per repo in time order, aggregated by day, and de-duplicated by SHA
    "CREATE INDEX IF NOT EXISTS idx_commits_repo_time ON commits(repo_id, committed_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_commits_time ON commits(committed_at)",
    "CREATE INDEX IF NOT EXISTS idx_commits_sha ON commits(sha)",
    # Events are pruned by age; health history is read newest-first per repo
    "CREATE INDEX IF NOT EXISTS idx_health_repo ON health_history(repo_id, recorded_at DESC)",
)


async def _connect(db_path: str) -> aiosqlite.Connection:
    """Open a connection with the settings every caller needs."""
    db = await aiosqlite.connect(db_path)
    await db.execute("PRAGMA foreign_keys = ON")  # the schema declares them; SQLite ignores them otherwise
    return db


async def init_db(db_path: str) -> None:
    """Create tables if they don't exist, then add any columns introduced later."""
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(db_path) as db:
        await db.execute(_CREATE_REPOS)
        await db.execute(_CREATE_COMMITS)
        await db.execute(_CREATE_SCAN_HISTORY)
        await db.execute(_CREATE_HEALTH_HISTORY)
        await db.execute(_CREATE_AI_USAGE)
        async with db.execute("PRAGMA table_info(repos)") as cursor:
            existing = {row[1] for row in await cursor.fetchall()}
        for column, ddl in _ADDED_REPO_COLUMNS.items():
            if column not in existing:
                await db.execute(f"ALTER TABLE repos ADD COLUMN {column} {ddl}")
        # file_events is no longer written (see _file_event_consumer). Dropping it reclaims
        # the space the old feedback loop consumed; nothing ever read these rows.
        async with db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='file_events'") as cursor:
            had_events = await cursor.fetchone() is not None
        if had_events:
            await db.execute("DROP TABLE file_events")

        for statement in _CREATE_INDEXES:
            await db.execute(statement)
        await db.execute("PRAGMA journal_mode=WAL")  # persistent; set once here
        await db.commit()
        if had_events:
            await db.execute("VACUUM")  # give the freed pages back to the filesystem


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Columns a scan must never overwrite: the identity, when we first saw it,
# and the choices the user made (collection, user_tags).
_PRESERVED_COLUMNS = {"id", "created_at", "collection", "user_tags"}


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


def _merged_tags(row: aiosqlite.Row) -> list[str]:
    """Scanner tags plus the user's own tags, without duplicates."""
    keys = row.keys()
    tags = json.loads(row["tags"] or "[]") if "tags" in keys else []
    user_tags = json.loads(row["user_tags"] or "[]") if "user_tags" in keys else []
    merged = list(tags)
    for tag in user_tags:
        if tag not in merged:
            merged.append(tag)
    # A deployed repo is treated as stable, not neglected
    if "deployed" in merged:
        merged = [t for t in merged if t != "stale"]
    return merged


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
        tags=_merged_tags(row),
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
    updates = ", ".join(f"{k}=excluded.{k}" for k in row.keys() if k not in _PRESERVED_COLUMNS)
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
    updates = ", ".join(f"{k}=excluded.{k}" for k in row0.keys() if k not in _PRESERVED_COLUMNS)
    sql = f"""
        INSERT INTO repos ({cols}) VALUES ({placeholders})
        ON CONFLICT(id) DO UPDATE SET {updates}
    """
    async with aiosqlite.connect(db_path) as db:
        for repo in repos:
            await db.execute(sql, _repo_to_row(repo))
        await db.commit()


async def get_all_repos(db_path: str) -> list[RepoRecord]:
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM repos ORDER BY latest_activity_at DESC") as cursor:
            rows = await cursor.fetchall()
    return [_row_to_repo(r) for r in rows]


async def set_repo_user_state(
    db_path: str,
    repo_id: str,
    collection: Optional[str] = None,
    clear_collection: bool = False,
    deployed: Optional[bool] = None,
) -> Optional[RepoRecord]:
    """Store choices the user made about a repo. Scans never overwrite these."""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT user_tags FROM repos WHERE id=?", (repo_id,)) as cursor:
            row = await cursor.fetchone()
        if row is None:
            return None

        if clear_collection:
            await db.execute("UPDATE repos SET collection=NULL WHERE id=?", (repo_id,))
        elif collection is not None:
            await db.execute("UPDATE repos SET collection=? WHERE id=?", (collection, repo_id))

        if deployed is not None:
            tags = set(json.loads(row["user_tags"] or "[]"))
            tags.add("deployed") if deployed else tags.discard("deployed")
            await db.execute("UPDATE repos SET user_tags=? WHERE id=?", (json.dumps(sorted(tags)), repo_id))

        await db.commit()
    return await get_repo(db_path, repo_id)


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


async def reconcile_missing_repos(
    db_path: str,
    seen_ids: set[str],
    grace_days: int = 7,
) -> tuple[int, int]:
    """Handle repos the latest scan did not find (deleted, moved, or on an unplugged drive).

    Within the grace period a repo is tagged ``missing`` and kept, so a drive that is
    briefly disconnected does not wipe its history. After the grace period the repo,
    its commits are deleted. Returns (marked, deleted).
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=grace_days)
    marked = deleted = 0
    async with aiosqlite.connect(db_path) as db:
        async with db.execute("SELECT id, tags, updated_at FROM repos") as cursor:
            rows = await cursor.fetchall()
        for repo_id, tags_json, updated_at in rows:
            if repo_id in seen_ids:
                continue
            last_seen = datetime.fromisoformat(updated_at)
            if last_seen.tzinfo is None:
                last_seen = last_seen.replace(tzinfo=timezone.utc)
            if last_seen < cutoff:
                await db.execute("DELETE FROM commits WHERE repo_id=?", (repo_id,))
                await db.execute("DELETE FROM repos WHERE id=?", (repo_id,))
                deleted += 1
            else:
                tags = json.loads(tags_json or "[]")
                if "missing" not in tags:
                    # A missing repo is neither active nor stale; it is simply not on disk
                    tags = [t for t in tags if t not in ("active", "stale")] + ["missing"]
                    await db.execute("UPDATE repos SET tags=? WHERE id=?", (json.dumps(tags), repo_id))
                    marked += 1
        await db.commit()
    return marked, deleted


async def get_commit_counts_since(db_path: str, since: datetime) -> dict[str, int]:
    """Number of distinct commits per repo committed at or after ``since``."""
    since_iso = since.astimezone(timezone.utc).isoformat()
    async with aiosqlite.connect(db_path) as db:
        async with db.execute(
            "SELECT repo_id, COUNT(DISTINCT sha) FROM commits WHERE committed_at >= ? GROUP BY repo_id",
            (since_iso,),
        ) as cursor:
            rows = await cursor.fetchall()
    return {repo_id: count for repo_id, count in rows}


async def get_commit_activity(db_path: str) -> list[dict]:
    """Every distinct commit (by SHA) across all repos: sha, committed_at, repo_id.

    A SHA present in two local clones is counted once, at its earliest recorded repo.
    """
    async with aiosqlite.connect(db_path) as db:
        async with db.execute(
            """SELECT sha, MIN(committed_at), MIN(repo_id) FROM commits
               GROUP BY sha ORDER BY MIN(committed_at) DESC"""
        ) as cursor:
            rows = await cursor.fetchall()
    return [{"sha": sha, "committed_at": ts, "repo_id": repo_id} for sha, ts, repo_id in rows]


async def get_known_shas_for(db_path: str, repo_id: str) -> set[str]:
    """SHAs already stored for one repo. Used by the per-repo rescan the watcher triggers."""
    async with aiosqlite.connect(db_path) as db:
        async with db.execute("SELECT sha FROM commits WHERE repo_id=?", (repo_id,)) as cursor:
            return {row[0] async for row in cursor}


async def get_known_shas(db_path: str) -> dict[str, set[str]]:
    """SHAs already stored per repo, so scans only diff new commits."""
    known: dict[str, set[str]] = {}
    async with aiosqlite.connect(db_path) as db:
        async with db.execute("SELECT repo_id, sha FROM commits") as cursor:
            async for repo_id, sha in cursor:
                known.setdefault(repo_id, set()).add(sha)
    return known


async def record_health(db_path: str, repo_id: str, health) -> bool:
    """Append a health snapshot when the score changed. Returns True if a row was written."""
    async with aiosqlite.connect(db_path) as db:
        async with db.execute(
            "SELECT score FROM health_history WHERE repo_id=? ORDER BY recorded_at DESC LIMIT 1",
            (repo_id,),
        ) as cursor:
            previous = await cursor.fetchone()
        if previous and previous[0] == health.score:
            return False
        await db.execute(
            "INSERT INTO health_history (repo_id, recorded_at, score, level, breakdown_json) VALUES (?,?,?,?,?)",
            (repo_id, _now(), health.score, health.level, health.breakdown.model_dump_json()),
        )
        await db.commit()
    return True


async def prune_health_history(db_path: str, keep_per_repo: int = 200) -> int:
    """Keep the newest snapshots per repo. Without this the table grows forever."""
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute(
            """DELETE FROM health_history WHERE id NOT IN (
                   SELECT id FROM health_history h2
                   WHERE h2.repo_id = health_history.repo_id
                   ORDER BY recorded_at DESC LIMIT ?
               )""",
            (keep_per_repo,),
        )
        await db.commit()
        return cursor.rowcount


async def get_health_history(db_path: str, repo_id: str, limit: int = 30) -> list[dict]:
    """Most recent health snapshots for a repo, newest first."""
    async with aiosqlite.connect(db_path) as db:
        async with db.execute(
            """SELECT recorded_at, score, level, breakdown_json FROM health_history
               WHERE repo_id=? ORDER BY recorded_at DESC LIMIT ?""",
            (repo_id, limit),
        ) as cursor:
            rows = await cursor.fetchall()
    return [
        {"recorded_at": r[0], "score": r[1], "level": r[2], "breakdown": json.loads(r[3])}
        for r in rows
    ]


async def get_deployed_repo_ids(db_path: str) -> set[str]:
    """Repos the user marked as deployed, so scans can exempt them from decay scoring."""
    async with aiosqlite.connect(db_path) as db:
        async with db.execute("SELECT id, user_tags FROM repos") as cursor:
            rows = await cursor.fetchall()
    return {repo_id for repo_id, tags in rows if "deployed" in json.loads(tags or "[]")}


async def count_repos(db_path: str) -> int:
    """Number of tracked repos, without loading any of them."""
    async with aiosqlite.connect(db_path) as db:
        async with db.execute("SELECT COUNT(*) FROM repos") as cursor:
            row = await cursor.fetchone()
    return row[0] if row else 0


async def query_repos(
    db_path: str,
    tag: Optional[str] = None,
    collection: Optional[str] = None,
    limit: Optional[int] = None,
    offset: int = 0,
) -> list[RepoRecord]:
    """Repos filtered in SQL rather than in Python after loading every row."""
    where: list[str] = []
    params: list = []
    if collection:
        where.append("collection = ?")
        params.append(collection)
    if tag:
        # tags are a JSON array of strings; match the quoted element
        where.append("(tags LIKE ? OR user_tags LIKE ?)")
        params += [f'%"{tag}"%', f'%"{tag}"%']

    sql = "SELECT * FROM repos"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY latest_activity_at DESC"
    if limit is not None:
        sql += " LIMIT ? OFFSET ?"
        params += [limit, offset]

    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(sql, params) as cursor:
            rows = await cursor.fetchall()
    repos = [_row_to_repo(r) for r in rows]
    # A deployed repo drops its "stale" tag on read, so filter that case in Python
    if tag:
        repos = [r for r in repos if tag in r.tags]
    return repos


async def get_commit_times(db_path: str, since: Optional[datetime] = None) -> list[str]:
    """Commit timestamps, de-duplicated by SHA. The caller buckets them by local day."""
    sql = "SELECT MIN(committed_at) FROM commits"
    params: list = []
    if since is not None:
        sql += " WHERE committed_at >= ?"
        params.append(since.astimezone(timezone.utc).isoformat())
    sql += " GROUP BY sha ORDER BY 1 DESC"

    async with aiosqlite.connect(db_path) as db:
        async with db.execute(sql, params) as cursor:
            rows = await cursor.fetchall()
    return [row[0] for row in rows]


async def record_ai_request(db_path: str, provider: str) -> None:
    """Count one request per provider per day, so the figure survives a restart."""
    day = datetime.now(timezone.utc).date().isoformat()
    async with aiosqlite.connect(db_path) as db:
        await db.execute(
            """INSERT INTO ai_usage (provider, day, requests) VALUES (?, ?, 1)
               ON CONFLICT(provider, day) DO UPDATE SET requests = requests + 1""",
            (provider, day),
        )
        await db.commit()


async def get_ai_usage(db_path: str) -> dict:
    """Totals per provider, plus the last 7 days, for the Settings panel."""
    async with aiosqlite.connect(db_path) as db:
        async with db.execute("SELECT provider, SUM(requests) FROM ai_usage GROUP BY provider") as cursor:
            totals = {provider: count for provider, count in await cursor.fetchall()}
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
        async with db.execute(
            "SELECT provider, SUM(requests) FROM ai_usage WHERE day >= ? GROUP BY provider", (cutoff,)
        ) as cursor:
            week = {provider: count for provider, count in await cursor.fetchall()}
    return {
        "ollama_requests": totals.get("ollama", 0),
        "gemini_requests": totals.get("gemini", 0),
        "local_fallbacks": totals.get("local", 0),
        "last_7_days": week,
    }
