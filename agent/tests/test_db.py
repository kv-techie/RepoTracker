"""Tests for agent/db.py — SQLite persistence layer."""

import pytest
import pytest_asyncio
from datetime import datetime, timezone

from agent.db import (
    upsert_repo, get_all_repos, get_repo,
    insert_commits, get_commits,
    record_scan, get_last_scan,
)
from agent.models import RepoRecord, CommitRecord, ScanResult, SyncStatus


def _make_repo(rid: str = "abc123", name: str = "test-repo") -> RepoRecord:
    return RepoRecord(
        id=rid,
        name=name,
        source_type="local_only",
        latest_source="local_filesystem",
        created_at=datetime.now(timezone.utc).isoformat(),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )


def _make_commit(repo_id: str, sha: str = "abc") -> CommitRecord:
    return CommitRecord(
        sha=sha,
        message="test commit",
        author="Test <t@t.com>",
        committed_at=datetime.now(timezone.utc),
        repo_id=repo_id,
    )


class TestRepoUpsert:
    @pytest.mark.asyncio
    async def test_insert_and_retrieve(self, tmp_db):
        repo = _make_repo()
        await upsert_repo(tmp_db, repo)
        result = await get_repo(tmp_db, repo.id)
        assert result is not None
        assert result.name == "test-repo"

    @pytest.mark.asyncio
    async def test_upsert_updates_existing(self, tmp_db):
        repo = _make_repo()
        await upsert_repo(tmp_db, repo)
        repo.name = "updated-name"
        await upsert_repo(tmp_db, repo)
        result = await get_repo(tmp_db, repo.id)
        assert result.name == "updated-name"

    @pytest.mark.asyncio
    async def test_get_all_repos(self, tmp_db):
        for i in range(3):
            await upsert_repo(tmp_db, _make_repo(rid=f"id{i}", name=f"repo{i}"))
        repos = await get_all_repos(tmp_db)
        assert len(repos) == 3

    @pytest.mark.asyncio
    async def test_get_nonexistent_repo(self, tmp_db):
        result = await get_repo(tmp_db, "does_not_exist")
        assert result is None

    @pytest.mark.asyncio
    async def test_empty_db_returns_empty_list(self, tmp_db):
        repos = await get_all_repos(tmp_db)
        assert repos == []


class TestCommits:
    @pytest.mark.asyncio
    async def test_insert_and_retrieve_commits(self, tmp_db):
        repo = _make_repo()
        await upsert_repo(tmp_db, repo)
        commits = [_make_commit(repo.id, sha=f"sha{i}") for i in range(5)]
        await insert_commits(tmp_db, commits)
        result = await get_commits(tmp_db, repo.id)
        assert len(result) == 5

    @pytest.mark.asyncio
    async def test_insert_commits_ignores_duplicates(self, tmp_db):
        repo = _make_repo()
        await upsert_repo(tmp_db, repo)
        commit = _make_commit(repo.id, sha="same_sha")
        await insert_commits(tmp_db, [commit, commit])
        result = await get_commits(tmp_db, repo.id)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_empty_commits_no_error(self, tmp_db):
        await insert_commits(tmp_db, [])  # should not raise



class TestScanHistory:
    @pytest.mark.asyncio
    async def test_record_and_retrieve_scan(self, tmp_db):
        scan = ScanResult(
            repos_found=5,
            duration_ms=120,
            scanned_at=datetime.now(timezone.utc),
        )
        await record_scan(tmp_db, scan)
        result = await get_last_scan(tmp_db)
        assert result is not None
        assert result.repos_found == 5

    @pytest.mark.asyncio
    async def test_last_scan_returns_none_when_empty(self, tmp_db):
        result = await get_last_scan(tmp_db)
        assert result is None


class TestReconcileMissingRepos:
    @pytest.mark.asyncio
    async def test_unseen_recent_repo_marked_missing(self, tmp_db):
        from datetime import datetime, timezone
        from agent.db import upsert_repo, get_repo, reconcile_missing_repos
        from agent.models import RepoRecord

        now = datetime.now(timezone.utc).isoformat()
        await upsert_repo(tmp_db, RepoRecord(id="gone", name="gone", tags=["stale"], created_at=now, updated_at=now))
        await upsert_repo(tmp_db, RepoRecord(id="here", name="here", tags=["active"], created_at=now, updated_at=now))

        marked, deleted = await reconcile_missing_repos(tmp_db, {"here"})

        assert (marked, deleted) == (1, 0)
        assert (await get_repo(tmp_db, "gone")).tags == ["missing"]
        assert (await get_repo(tmp_db, "here")).tags == ["active"]

    @pytest.mark.asyncio
    async def test_unseen_repo_past_grace_deleted(self, tmp_db):
        from datetime import datetime, timedelta, timezone
        from agent.db import upsert_repo, get_repo, reconcile_missing_repos
        from agent.models import RepoRecord

        import aiosqlite

        old = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        await upsert_repo(tmp_db, RepoRecord(id="old", name="old", created_at=old, updated_at=old))
        # upsert stamps updated_at with "now" (last seen); backdate it to simulate a long absence
        async with aiosqlite.connect(tmp_db) as db:
            await db.execute("UPDATE repos SET updated_at=? WHERE id='old'", (old,))
            await db.commit()

        marked, deleted = await reconcile_missing_repos(tmp_db, set(), grace_days=7)

        assert (marked, deleted) == (0, 1)
        assert await get_repo(tmp_db, "old") is None


class TestCommitCountsSince:
    @pytest.mark.asyncio
    async def test_counts_only_recent_commits(self, tmp_db):
        from datetime import timedelta
        from agent.db import get_commit_counts_since

        now = datetime.now(timezone.utc)
        await upsert_repo(tmp_db, RepoRecord(id="r1", name="r1", created_at=now.isoformat(), updated_at=now.isoformat()))
        await insert_commits(tmp_db, [
            CommitRecord(sha="a", message="new", author="x", committed_at=now - timedelta(days=1), repo_id="r1"),
            CommitRecord(sha="b", message="new", author="x", committed_at=now - timedelta(days=3), repo_id="r1"),
            CommitRecord(sha="c", message="old", author="x", committed_at=now - timedelta(days=20), repo_id="r1"),
        ])

        counts = await get_commit_counts_since(tmp_db, now - timedelta(days=7))

        assert counts == {"r1": 2}
