"""Tests for agent/resolver.py — Hybrid Source Resolver™."""

from datetime import datetime, timezone, timedelta
import pytest

from agent.resolver import resolve_latest_source, resolve_latest_source_iso


def _dt(days_ago: float) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days_ago)


class TestResolveLatestSource:
    def test_file_mtime_wins_when_newest(self):
        source, ts = resolve_latest_source(
            file_mtime=_dt(0),      # just now
            local_commit_time=_dt(1),
            remote_push_time=_dt(2),
        )
        assert source == "local_filesystem"
        assert ts is not None

    def test_local_git_wins_when_newest(self):
        source, _ = resolve_latest_source(
            file_mtime=_dt(2),
            local_commit_time=_dt(0),  # newest
            remote_push_time=_dt(3),
        )
        assert source == "local_git"

    def test_github_remote_wins_when_newest(self):
        source, _ = resolve_latest_source(
            file_mtime=_dt(5),
            local_commit_time=_dt(4),
            remote_push_time=_dt(0),  # newest
        )
        assert source == "github_remote"

    def test_local_filesystem_wins_on_tie(self):
        """Local always wins on equal timestamps."""
        same_time = _dt(1)
        source, _ = resolve_latest_source(
            file_mtime=same_time,
            local_commit_time=same_time,
            remote_push_time=same_time,
        )
        assert source == "local_filesystem"

    def test_none_file_mtime_falls_back_to_git(self):
        source, _ = resolve_latest_source(
            file_mtime=None,
            local_commit_time=_dt(0),
            remote_push_time=_dt(5),
        )
        assert source == "local_git"

    def test_all_none_returns_github_remote(self):
        source, ts = resolve_latest_source(None, None, None)
        assert source == "github_remote"
        assert ts is None

    def test_only_remote_available(self):
        source, ts = resolve_latest_source(
            file_mtime=None,
            local_commit_time=None,
            remote_push_time=_dt(1),
        )
        assert source == "github_remote"
        assert ts is not None

    def test_naive_datetime_normalised_to_utc(self):
        naive = datetime(2025, 1, 1, 12, 0, 0)  # no tzinfo
        source, ts = resolve_latest_source(
            file_mtime=naive,
            local_commit_time=None,
            remote_push_time=None,
        )
        assert source == "local_filesystem"
        assert ts.tzinfo is not None

    def test_iso_wrapper(self):
        source, ts_iso = resolve_latest_source_iso(
            file_mtime_iso="2025-01-10T10:00:00+00:00",
            local_commit_iso="2025-01-09T10:00:00+00:00",
            remote_push_iso="2025-01-08T10:00:00+00:00",
        )
        assert source == "local_filesystem"
        assert ts_iso == "2025-01-10T10:00:00+00:00"

    def test_iso_wrapper_all_none(self):
        source, ts = resolve_latest_source_iso(None, None, None)
        assert source == "github_remote"
        assert ts is None
