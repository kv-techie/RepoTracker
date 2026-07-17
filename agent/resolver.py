"""Hybrid Source Resolver™.

Determines the true latest activity for a repo by comparing:
  1. local file modification timestamp  (fastest)
  2. local git commit timestamp
  3. remote git push timestamp

Returns the freshest timestamp and names its source.
Never assumes GitHub is authoritative (rules §3).
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional

from agent.models import LatestSource


def _utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Normalise datetime to UTC-aware."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def resolve_latest_source(
    file_mtime: Optional[datetime],
    local_commit_time: Optional[datetime],
    remote_push_time: Optional[datetime],
) -> tuple[LatestSource, Optional[datetime]]:
    """
    Compare all three timestamps and return (source_name, timestamp).

    Priority order when timestamps are equal: local_filesystem wins,
    then local_git, then github_remote (local always wins on ties).
    """
    candidates: list[tuple[LatestSource, Optional[datetime]]] = [
        ("local_filesystem", _utc(file_mtime)),
        ("local_git", _utc(local_commit_time)),
        ("github_remote", _utc(remote_push_time)),
    ]

    # Filter out None timestamps
    valid = [(src, ts) for src, ts in candidates if ts is not None]

    if not valid:
        # No information at all — default to github_remote (least surprising)
        return ("github_remote", None)

    # Pick the freshest; on a tie the first in list wins (local preference)
    best_source, best_ts = max(valid, key=lambda x: x[1])  # type: ignore[arg-type]
    return (best_source, best_ts)


def resolve_latest_source_iso(
    file_mtime_iso: Optional[str],
    local_commit_iso: Optional[str],
    remote_push_iso: Optional[str],
) -> tuple[LatestSource, Optional[str]]:
    """Convenience wrapper that accepts ISO strings and returns ISO string."""

    def _parse(s: Optional[str]) -> Optional[datetime]:
        if not s:
            return None
        try:
            return datetime.fromisoformat(s)
        except ValueError:
            return None

    source, ts = resolve_latest_source(
        _parse(file_mtime_iso),
        _parse(local_commit_iso),
        _parse(remote_push_iso),
    )
    return (source, ts.isoformat() if ts else None)
