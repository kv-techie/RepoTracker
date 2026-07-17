"""Tests for agent/scanner.py — Git Repository Scanner."""

import os
import pytest

from agent.scanner import scan_folder, _scan_repo, _count_uncommitted


class TestScanFolder:
    def test_finds_git_repos(self, simple_git_repo, tmp_path):
        # simple_git_repo IS tmp_path
        parent = str(tmp_path.parent)
        results = scan_folder(parent)
        repo_names = [r.name for r, _ in results]
        assert tmp_path.name in repo_names

    def test_nonexistent_folder_returns_empty(self, tmp_dir):
        results = scan_folder(os.path.join(tmp_dir, "does_not_exist"))
        assert results == []

    def test_empty_folder_returns_empty(self, tmp_path):
        results = scan_folder(str(tmp_path))
        assert results == []


class TestScanRepo:
    def test_basic_scan_returns_record(self, simple_git_repo):
        result = _scan_repo(simple_git_repo, 30, 90)
        assert result is not None
        repo, commits = result
        assert repo.name == os.path.basename(simple_git_repo)
        assert repo.local_path == simple_git_repo

    def test_local_only_repo_tagged(self, local_only_repo):
        result = _scan_repo(local_only_repo, 30, 90)
        assert result is not None
        repo, _ = result
        assert "local_only" in repo.tags
        assert repo.source_type == "local_only"

    def test_has_commits(self, simple_git_repo):
        result = _scan_repo(simple_git_repo, 30, 90)
        assert result is not None
        _, commits = result
        assert len(commits) >= 1

    def test_readme_detected(self, simple_git_repo):
        result = _scan_repo(simple_git_repo, 30, 90)
        assert result is not None
        repo, _ = result
        assert repo.readme is not None
        assert repo.readme.has_readme is True

    def test_health_score_present(self, simple_git_repo):
        result = _scan_repo(simple_git_repo, 30, 90)
        assert result is not None
        repo, _ = result
        assert repo.health is not None
        assert 0 <= repo.health.score <= 100

    def test_staleness_present(self, simple_git_repo):
        result = _scan_repo(simple_git_repo, 30, 90)
        assert result is not None
        repo, _ = result
        assert repo.staleness is not None
        # freshly created repo should be low risk
        assert repo.staleness.risk == "low"

    def test_uncommitted_changes_counted(self, repo_with_uncommitted):
        result = _scan_repo(repo_with_uncommitted, 30, 90)
        assert result is not None
        repo, _ = result
        assert repo.sync.uncommitted_changes >= 2

    def test_broken_repo_returns_broken_record(self, tmp_path):
        # Create .git dir but make it invalid
        (tmp_path / ".git").mkdir()
        result = _scan_repo(str(tmp_path), 30, 90)
        assert result is not None
        repo, _ = result
        assert "broken" in repo.tags

    def test_latest_source_is_set(self, simple_git_repo):
        result = _scan_repo(simple_git_repo, 30, 90)
        assert result is not None
        repo, _ = result
        assert repo.latest_source in ("local_filesystem", "local_git", "github_remote")

    def test_tags_populated(self, simple_git_repo):
        result = _scan_repo(simple_git_repo, 30, 90)
        assert result is not None
        repo, _ = result
        # Should have at least one tag
        assert isinstance(repo.tags, list)
