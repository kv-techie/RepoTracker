"""Pydantic models shared between agent modules and API responses.

These mirror the TypeScript types in types/repo.ts and types/agent.ts.
"""

from __future__ import annotations
import os
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Source / Sync
# ---------------------------------------------------------------------------

LatestSource = str  # "local_filesystem" | "local_git" | "github_remote"
SourceType = str    # "local_only" | "github" | "hybrid"
MomentumLevel = str # "growing" | "stable" | "declining"
StalenessRisk = str # "low" | "moderate" | "high" | "critical"
FilterTag = str     # "active" | "stale" | "unpushed" | "local_only" | "broken"


class SyncStatus(BaseModel):
    local_ahead_by: int = 0
    remote_ahead_by: int = 0
    is_diverged: bool = False
    uncommitted_changes: int = 0
    has_stash: bool = False
    upstream: Optional[str] = None  # e.g. "origin/main"; None when the branch tracks nothing


# ---------------------------------------------------------------------------
# Health Scoring (explainable — rules §9)
# ---------------------------------------------------------------------------

class HealthBreakdown(BaseModel):
    """Human-readable explanation of every factor in the health score."""
    base_score: int = 50
    commit_recency_bonus: int = 0
    readme_bonus: int = 0
    clean_branches_bonus: int = 0
    stale_branch_penalty: int = 0
    uncommitted_penalty: int = 0
    no_activity_penalty: int = 0
    reasons: list[str] = Field(default_factory=list)


class HealthScore(BaseModel):
    score: int = Field(ge=0, le=100)
    breakdown: HealthBreakdown
    level: str  # "critical" | "poor" | "fair" | "good" | "excellent"


class MomentumScore(BaseModel):
    level: MomentumLevel
    commit_count_last_4w: int
    commit_count_prev_4w: int
    change_pct: float
    reason: str


class StalenessInfo(BaseModel):
    risk: StalenessRisk
    days_since_activity: int
    days_until_stale: int  # negative = already stale
    days_until_dead: int   # negative = already dead
    message: str


# ---------------------------------------------------------------------------
# Commit
# ---------------------------------------------------------------------------

class CommitRecord(BaseModel):
    sha: str
    message: str
    author: str
    committed_at: datetime
    files_changed: int = 0
    insertions: int = 0
    deletions: int = 0
    repo_id: str = ""


# ---------------------------------------------------------------------------
# File Intelligence
# ---------------------------------------------------------------------------

class FileEvent(BaseModel):
    file_path: str
    event_type: str  # "modified" | "created" | "deleted"
    occurred_at: datetime
    repo_id: str
    repo_root: Optional[str] = Field(default=None, exclude=True)  # internal: which repo to rescan


class LargeFile(BaseModel):
    path: str
    size_bytes: int
    language: str = ""


class HotspotFile(BaseModel):
    path: str
    change_count: int
    last_modified: datetime


class FileIntelligence(BaseModel):
    """File-level analytics. ``total_tokens`` is an estimate of how much of this repo
    a model would have to read: tracked source files only, no lockfiles or build output."""
    has_tests: bool = False
    test_file_count: int = 0
    context_file_count: int = 0  # files counted toward total_tokens
    structure_signals: list[str] = Field(default_factory=list)
    total_files: int = 0
    total_lines: int = 0
    total_tokens: int = 0
    large_files: list[LargeFile] = Field(default_factory=list)
    hotspots: list[HotspotFile] = Field(default_factory=list)
    recently_modified: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# README Intelligence
# ---------------------------------------------------------------------------

class ReadmeScore(BaseModel):
    """What a README actually contains, read from the document rather than its outline."""
    score: int = Field(ge=0, le=100)
    has_readme: bool
    has_description: bool
    has_installation: bool
    has_usage: bool
    has_license: bool
    has_code_examples: bool = False
    has_screenshots: bool = False
    word_count: int = 0
    code_block_count: int = 0
    evidence: list[str] = Field(default_factory=list)  # why each section counted
    missing_sections: list[str] = Field(default_factory=list)
    badge_suggestions: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Repo (main model)
# ---------------------------------------------------------------------------

class RepoRecord(BaseModel):
    id: str
    name: str
    # Internal only: excluded from API responses so filesystem paths never reach the browser
    local_path: Optional[str] = Field(default=None, exclude=True)
    remote_url: Optional[str] = None
    source_type: SourceType = "local_only"
    latest_source: LatestSource = "local_filesystem"

    current_branch: str = "main"
    default_branch: str = "main"
    is_private: bool = False
    description: Optional[str] = None
    language: Optional[str] = None
    topics: list[str] = Field(default_factory=list)

    # Timestamps (ISO strings for JSON serialisation)
    last_local_commit_at: Optional[str] = None
    last_remote_push_at: Optional[str] = None
    last_file_modified_at: Optional[str] = None
    latest_activity_at: Optional[str] = None

    sync: SyncStatus = Field(default_factory=SyncStatus)
    health: Optional[HealthScore] = None
    momentum: Optional[MomentumScore] = None
    staleness: Optional[StalenessInfo] = None
    readme: Optional[ReadmeScore] = None
    file_intelligence: Optional[FileIntelligence] = None

    tags: list[FilterTag] = Field(default_factory=list)
    collection: Optional[str] = None

    github_stars: int = 0
    github_forks: int = 0

    created_at: str = ""
    updated_at: str = ""


# ---------------------------------------------------------------------------
# Agent Status
# ---------------------------------------------------------------------------

class ScanResult(BaseModel):
    repos_found: int
    duration_ms: int
    scanned_at: datetime


class AgentStatus(BaseModel):
    online: bool = True
    version: str = "1.0.0"
    last_scan: Optional[datetime] = None
    # Paths are internal only; the API exposes just the count
    watching_folders: list[str] = Field(default_factory=list, exclude=True)
    db_path: str = Field(default="", exclude=True)
    watching_folder_count: int = 0
    repo_count: int = 0
    ai_enabled: bool = False


# ---------------------------------------------------------------------------
# Config update request
# ---------------------------------------------------------------------------

class RepoUserUpdate(BaseModel):
    """Choices the user makes about a repo, kept across rescans."""
    collection: Optional[str] = None
    clear_collection: bool = False
    deployed: Optional[bool] = None


class ConfigUpdateRequest(BaseModel):
    watched_folders: Optional[list[str]] = None
    scan_interval_seconds: Optional[int] = Field(default=None, ge=30)
    ai_enabled: Optional[bool] = None
    ai_mode: Optional[Literal["auto", "ollama", "gemini", "disabled"]] = None
    gemini_api_key: Optional[str] = None
    ollama_model: Optional[str] = None
    gemini_model: Optional[str] = None
    stale_threshold_days: Optional[int] = Field(default=None, ge=1)
    dead_threshold_days: Optional[int] = Field(default=None, ge=1)
    auto_fetch: Optional[bool] = None
    fetch_interval_minutes: Optional[int] = Field(default=None, ge=5)

    @field_validator("watched_folders")
    @classmethod
    def folders_must_exist(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return v
        missing = [f for f in v if not os.path.isdir(f)]
        if missing:
            raise ValueError(f"Not an existing folder: {', '.join(missing)}")
        return v
