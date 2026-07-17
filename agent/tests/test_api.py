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

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
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
