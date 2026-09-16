"""Integration tests for agent/main.py FastAPI endpoints."""

import pytest
import pytest_asyncio
from datetime import datetime, timezone
from httpx import AsyncClient, ASGITransport

from agent.main import app
from agent.db import init_db, upsert_repo
from agent.models import RepoRecord


@pytest_asyncio.fixture
async def client(tmp_path, monkeypatch):
    """Test client with isolated DB."""
    db_path = str(tmp_path / "test.db")
    await init_db(db_path)

    monkeypatch.setattr("agent.main.config.db_path", db_path)
    monkeypatch.setattr("agent.main.config.watched_folders", [])

    monkeypatch.setattr("agent.main.config.agent_token", "test-token")

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"X-Agent-Token": "test-token"},
    ) as ac:
        yield ac, db_path


class TestStatusEndpoint:
    @pytest.mark.asyncio
    async def test_status_returns_online(self, client):
        ac, _ = client
        response = await ac.get("/status")
        assert response.status_code == 200
        data = response.json()
        assert data["online"] is True


class TestReposEndpoint:
    @pytest.mark.asyncio
    async def test_empty_repo_list(self, client):
        ac, _ = client
        response = await ac.get("/repos")
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_list_repos_with_data(self, client):
        ac, db_path = client
        repo = RepoRecord(
            id="test123",
            name="my-repo",
            source_type="local_only",
            latest_source="local_filesystem",
            tags=["active"],
            created_at=datetime.now(timezone.utc).isoformat(),
            updated_at=datetime.now(timezone.utc).isoformat(),
        )
        await upsert_repo(db_path, repo)
        response = await ac.get("/repos")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "my-repo"

    @pytest.mark.asyncio
    async def test_filter_by_tag(self, client):
        ac, db_path = client
        for tag, rid in [("active", "r1"), ("stale", "r2")]:
            r = RepoRecord(
                id=rid, name=f"repo-{tag}", source_type="local_only",
                latest_source="local_filesystem", tags=[tag],
                created_at=datetime.now(timezone.utc).isoformat(),
                updated_at=datetime.now(timezone.utc).isoformat(),
            )
            await upsert_repo(db_path, r)

        response = await ac.get("/repos?tag=active")
        assert len(response.json()) == 1
        assert response.json()[0]["id"] == "r1"

    @pytest.mark.asyncio
    async def test_get_nonexistent_repo_404(self, client):
        ac, _ = client
        response = await ac.get("/repos/nonexistent")
        assert response.status_code == 404


class TestConfigEndpoint:
    @pytest.mark.asyncio
    async def test_get_config(self, client):
        ac, _ = client
        response = await ac.get("/config")
        assert response.status_code == 200
        data = response.json()
        assert "scan_interval_seconds" in data
        assert "watched_folders" in data


class TestScanEndpoint:
    @pytest.mark.asyncio
    async def test_trigger_scan_accepted(self, client):
        ac, _ = client
        response = await ac.post("/scan")
        assert response.status_code == 200
        assert "message" in response.json()


class TestAgentAuth:
    @pytest.mark.asyncio
    async def test_missing_token_rejected(self, client):
        ac, _ = client
        response = await ac.get("/status", headers={"X-Agent-Token": ""})
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_wrong_token_rejected(self, client):
        ac, _ = client
        response = await ac.get("/repos", headers={"X-Agent-Token": "wrong"})
        assert response.status_code == 401


class TestNoPathsExposed:
    @pytest.mark.asyncio
    async def test_repo_list_omits_local_path(self, client):
        ac, db_path = client
        now = datetime.now(timezone.utc).isoformat()
        await upsert_repo(db_path, RepoRecord(
            id="p1", name="secret-path", local_path="C:/Users/someone/projects/secret-path",
            created_at=now, updated_at=now,
        ))
        response = await ac.get("/repos")
        assert response.status_code == 200
        assert "local_path" not in response.json()[0]
        assert "C:/Users" not in response.text

    @pytest.mark.asyncio
    async def test_status_omits_paths(self, client, monkeypatch):
        ac, _ = client
        monkeypatch.setattr("agent.main.config.watched_folders", ["C:/Users/someone/projects"])
        data = (await ac.get("/status")).json()
        assert "db_path" not in data
        assert "watching_folders" not in data
        assert data["watching_folder_count"] == 1


class TestConfigValidation:
    @pytest.mark.asyncio
    async def test_rejects_missing_folder(self, client):
        ac, _ = client
        response = await ac.patch("/config", json={"watched_folders": ["Z:/definitely/not/here"]})
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_rejects_unknown_ai_mode(self, client):
        ac, _ = client
        response = await ac.patch("/config", json={"ai_mode": "openai"})
        assert response.status_code == 422


class TestSecretStorage:
    def test_secrets_never_written_to_config_json(self, tmp_path, monkeypatch):
        import json
        import agent.config as cfg_mod

        monkeypatch.setattr(cfg_mod, "_CONFIG_PATH", tmp_path / "config.json")
        monkeypatch.setattr(cfg_mod, "_ENV_PATH", tmp_path / ".env")
        monkeypatch.setattr(cfg_mod.config, "gemini_api_key", "")

        cfg_mod.update_config({"gemini_api_key": "sekret-value", "scan_interval_seconds": 120})

        assert "sekret-value" not in (tmp_path / "config.json").read_text()
        assert json.loads((tmp_path / "config.json").read_text())["scan_interval_seconds"] == 120
        assert "RT_GEMINI_API_KEY=sekret-value" in (tmp_path / ".env").read_text()
        assert cfg_mod.config.gemini_api_key == "sekret-value"

    def test_legacy_secrets_migrate_out_of_config_json(self, tmp_path, monkeypatch):
        import json
        import agent.config as cfg_mod

        (tmp_path / "config.json").write_text(json.dumps({"gemini_api_key": "old-key", "ai_mode": "auto"}))
        monkeypatch.setattr(cfg_mod, "_CONFIG_PATH", tmp_path / "config.json")
        monkeypatch.setattr(cfg_mod, "_ENV_PATH", tmp_path / ".env")
        monkeypatch.delenv("RT_GEMINI_API_KEY", raising=False)

        cfg = cfg_mod.load_config()

        assert cfg.gemini_api_key == "old-key"
        assert "old-key" not in (tmp_path / "config.json").read_text()
        assert "RT_GEMINI_API_KEY=old-key" in (tmp_path / ".env").read_text()
        assert cfg.agent_token


class TestInsightCommits:
    @pytest.mark.asyncio
    async def test_same_sha_in_two_repos_counted_once(self, client):
        from agent.db import insert_commits
        from agent.models import CommitRecord

        ac, db_path = client
        now = datetime.now(timezone.utc)
        for rid in ("clone-a", "clone-b"):
            await upsert_repo(db_path, RepoRecord(id=rid, name=rid, created_at=now.isoformat(), updated_at=now.isoformat()))
            await insert_commits(db_path, [
                CommitRecord(sha="shared", message="m", author="x", committed_at=now, repo_id=rid),
            ])
        await insert_commits(db_path, [
            CommitRecord(sha="only-a", message="m", author="x", committed_at=now, repo_id="clone-a"),
        ])

        data = (await ac.get("/insights/commits")).json()

        # timestamps only, one per distinct SHA: two commits, not three
        assert len(data["commits"]) == 2

    @pytest.mark.asyncio
    async def test_years_window_limits_history(self, client):
        from datetime import timedelta
        from agent.db import insert_commits
        from agent.models import CommitRecord

        ac, db_path = client
        now = datetime.now(timezone.utc)
        await upsert_repo(db_path, RepoRecord(id="w1", name="w1", created_at=now.isoformat(), updated_at=now.isoformat()))
        await insert_commits(db_path, [
            CommitRecord(sha="recent", message="m", author="x", committed_at=now - timedelta(days=30), repo_id="w1"),
            CommitRecord(sha="ancient", message="m", author="x", committed_at=now - timedelta(days=1200), repo_id="w1"),
        ])

        assert len((await ac.get("/insights/commits?years=1")).json()["commits"]) == 1
        assert len((await ac.get("/insights/commits")).json()["commits"]) == 2


class TestWatcherRescan:
    @pytest.mark.asyncio
    async def test_rescan_repo_stores_single_repo(self, client, simple_git_repo):
        from agent.main import rescan_repo
        from agent.db import get_all_repos

        _, db_path = client
        assert await rescan_repo(simple_git_repo) is True

        repos = await get_all_repos(db_path)
        assert len(repos) == 1
        assert repos[0].local_path == simple_git_repo

    def test_watcher_ignores_database_churn(self):
        import asyncio
        from agent.watcher import RepoChangeHandler

        handler = RepoChangeHandler(asyncio.Queue(), asyncio.new_event_loop())
        assert handler._skip("C:/work/RepoTracker/agent/repotracker.db-wal")
        assert handler._skip("C:/work/app/node_modules/x/index.js")
        assert not handler._skip("C:/work/app/src/index.ts")

    def test_full_queue_drops_oldest(self):
        import asyncio
        from datetime import datetime, timezone
        from agent.models import FileEvent
        from agent.watcher import RepoChangeHandler

        queue: asyncio.Queue = asyncio.Queue(maxsize=2)
        handler = RepoChangeHandler(queue, asyncio.new_event_loop())
        for name in ("a", "b", "c"):
            handler._offer(FileEvent(file_path=name, event_type="modified",
                                     occurred_at=datetime.now(timezone.utc), repo_id="r"))

        assert [queue.get_nowait().file_path for _ in range(2)] == ["b", "c"]



class TestRepoUserState:
    @pytest.mark.asyncio
    async def test_collection_and_deployed_survive_a_rescan(self, client, simple_git_repo):
        from agent.main import rescan_repo
        from agent.db import get_all_repos
        from agent.scanner import _repo_id

        ac, db_path = client
        await rescan_repo(simple_git_repo)
        repo_id = _repo_id(simple_git_repo)

        response = await ac.patch(f"/repos/{repo_id}", json={"collection": "freelance", "deployed": True})
        assert response.status_code == 200
        assert response.json()["collection"] == "freelance"
        assert "deployed" in response.json()["tags"]

        await rescan_repo(simple_git_repo)  # a scan must not wipe the user choices

        repo = (await get_all_repos(db_path))[0]
        assert repo.collection == "freelance"
        assert "deployed" in repo.tags
        assert "stale" not in repo.tags  # deployed repos are not treated as neglected

    @pytest.mark.asyncio
    async def test_unknown_repo_returns_404(self, client):
        ac, _ = client
        assert (await ac.patch("/repos/nope", json={"deployed": True})).status_code == 404


class TestHealthHistory:
    @pytest.mark.asyncio
    async def test_history_explains_what_changed(self, client):
        from agent.db import record_health
        from agent.models import HealthScore, HealthBreakdown

        ac, db_path = client
        now = datetime.now(timezone.utc).isoformat()
        await upsert_repo(db_path, RepoRecord(id="h1", name="h1", created_at=now, updated_at=now))
        await record_health(db_path, "h1", HealthScore(
            score=80, level="good", breakdown=HealthBreakdown(readme_bonus=10, commit_recency_bonus=20)))
        await record_health(db_path, "h1", HealthScore(
            score=65, level="fair", breakdown=HealthBreakdown(readme_bonus=10, no_activity_penalty=-15)))

        data = (await ac.get("/repos/h1/health")).json()

        assert len(data["history"]) == 2
        assert "-20 from recent activity" in data["changes"]
        assert "-15 from inactivity" in data["changes"]

    @pytest.mark.asyncio
    async def test_unchanged_score_is_not_recorded_twice(self, client):
        from agent.db import record_health, get_health_history
        from agent.models import HealthScore, HealthBreakdown

        _, db_path = client
        now = datetime.now(timezone.utc).isoformat()
        await upsert_repo(db_path, RepoRecord(id="h2", name="h2", created_at=now, updated_at=now))
        health = HealthScore(score=70, level="good", breakdown=HealthBreakdown())
        assert await record_health(db_path, "h2", health) is True
        assert await record_health(db_path, "h2", health) is False
        assert len(await get_health_history(db_path, "h2")) == 1


class TestDeployedRescoring:
    @pytest.mark.asyncio
    async def test_marking_deployed_rescores_the_repo(self, client, tmp_path):
        import os
        import time
        import git
        from agent.main import rescan_repo
        from agent.scanner import _repo_id

        ac, _ = client

        # A repo whose last commit and last file change are both long past
        work = tmp_path / "abandoned"
        work.mkdir()
        repo = git.Repo.init(str(work))
        repo.config_writer().set_value("user", "name", "T").release()
        repo.config_writer().set_value("user", "email", "t@t.com").release()
        (work / "README.md").write_text("# Shipped\n\nA finished project.\n")
        repo.index.add(["README.md"])
        old_date = "2025-01-05T10:00:00"
        repo.index.commit("ship it", author_date=old_date, commit_date=old_date)
        old = time.time() - 200 * 86_400
        os.utime(work / "README.md", (old, old))

        await rescan_repo(str(work))
        repo_id = _repo_id(str(work))

        before = (await ac.get(f"/repos/{repo_id}")).json()
        assert before["staleness"]["risk"] == "critical"
        assert before["health"]["breakdown"]["no_activity_penalty"] == -25

        after = (await ac.patch(f"/repos/{repo_id}", json={"deployed": True})).json()

        assert "deployed" in after["tags"]
        assert "stale" not in after["tags"]
        assert after["staleness"]["risk"] == "low"
        assert after["health"]["breakdown"]["no_activity_penalty"] == 0
        assert after["health"]["score"] == before["health"]["score"] + 45  # -25 penalty removed, +20 stability
        assert after["momentum"]["reason"].lower().startswith("marked deployed")
