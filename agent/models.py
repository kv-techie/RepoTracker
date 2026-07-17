"""Pydantic models shared between agent modules and API responses.

These mirror the TypeScript types in types/repo.ts and types/agent.ts.
"""

from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


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


# ---------------------------------------------------------------------------
# Health Scoring (explainable — rules §9)
# ---------------------------------------------------------------------------

class HealthBreakdown(BaseModel):
    """Human-readable explanation of every factor in the health score."""
    base_score: int = 50
    commit_recency_bonus: int = 0
    readme_bonus: int = 0
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


class LargeFile(BaseModel):
    path: str
    size_bytes: int
    language: str = ""


class HotspotFile(BaseModel):
    path: str
    change_count: int
    last_modified: datetime


class FileIntelligence(BaseModel):
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
    score: int = Field(ge=0, le=100)
    has_readme: bool
    has_description: bool
    has_installation: bool
    has_usage: bool
    has_license: bool
    missing_sections: list[str] = Field(default_factory=list)
    badge_suggestions: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Repo (main model)
# ---------------------------------------------------------------------------

class RepoRecord(BaseModel):
    id: str
    name: str
    local_path: Optional[str] = None
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
    watching_folders: list[str] = Field(default_factory=list)
    db_path: str = ""
    repo_count: int = 0
    ai_enabled: bool = False


# ---------------------------------------------------------------------------
# Config update request
# ---------------------------------------------------------------------------

class ConfigUpdateRequest(BaseModel):
    watched_folders: Optional[list[str]] = None
    scan_interval_seconds: Optional[int] = None
    github_pat: Optional[str] = None
    ai_enabled: Optional[bool] = None
    ai_mode: Optional[str] = None
    gemini_api_key: Optional[str] = None
    ollama_model: Optional[str] = None
    stale_threshold_days: Optional[int] = None
    dead_threshold_days: Optional[int] = None
