"""Recruiter Lens™ — rule-based scoring engine + AI commentary prompt.

Produces a structured evaluation of a repository from a recruiter's
perspective. The rule-based score and hiring signals are ALWAYS
computed locally (no AI required). The Recruiter Commentary is
generated optionally via the AI orchestrator.
"""

from __future__ import annotations
import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Signal level helpers
# ---------------------------------------------------------------------------

def _level(score: float) -> str:
    if score >= 80:
        return "Strong"
    if score >= 55:
        return "Good"
    if score >= 35:
        return "Moderate"
    return "Weak"


# ---------------------------------------------------------------------------
# Rule-based Portfolio Score
# ---------------------------------------------------------------------------

def compute_recruiter_score(repo: dict) -> dict:
    """
    Produces a Portfolio Score (0-100) and Hiring Signals purely from
    the existing RepoRecord data — no AI needed.

    Criteria & weights:
      README quality        20 pts
      Commit hygiene        20 pts  (frequency + message quality proxy)
      Test coverage signal  15 pts  (presence of test files)
      Deployment readiness  15 pts  (deployed tag, remote URL)
      Documentation quality 10 pts  (readme score sub-sections)
      Architecture maturity 10 pts  (file count, token size)
      Project uniqueness     5 pts  (description, topics)
      Maintainability        5 pts  (health score proxy)
    """
    pts = 0
    signals: dict[str, str] = {}
    improvements: list[str] = []

    # ── README quality (20 pts) ──────────────────────────────────────────────
    readme = repo.get("readme") or {}
    readme_score = readme.get("score", 0)
    readme_pts = int(readme_score * 0.20)
    pts += readme_pts
    signals["README Quality"] = _level(readme_score)
    if readme_score < 60:
        improvements.append("Improve README: add Installation, Usage, and License sections")

    # ── Commit hygiene (20 pts) ──────────────────────────────────────────────
    health = repo.get("health") or {}
    health_score = health.get("score", 0)
    staleness = (repo.get("staleness") or {}).get("risk", "critical")
    momentum = (repo.get("momentum") or {}).get("level", "stable")

    commit_score = health_score
    if staleness in ("low",):
        commit_score = min(commit_score + 15, 100)
    if momentum == "growing":
        commit_score = min(commit_score + 10, 100)
    elif momentum == "declining":
        commit_score = max(commit_score - 15, 0)

    commit_pts = int(commit_score * 0.20)
    pts += commit_pts
    signals["Commit Hygiene"] = _level(commit_score)
    if staleness in ("high", "critical"):
        improvements.append("Resume regular commits — the repo appears inactive")

    # ── Test coverage signal (15 pts) ────────────────────────────────────────
    fi = repo.get("file_intelligence") or {}
    recently_modified = fi.get("recently_modified") or []
    test_files = [f for f in recently_modified if "test" in f.lower() or "spec" in f.lower()]
    hotspots = fi.get("hotspots") or []
    hotspot_tests = [h for h in hotspots if "test" in str(h.get("path", "")).lower()]

    has_tests = bool(test_files or hotspot_tests)
    test_pts = 15 if has_tests else 0
    pts += test_pts
    signals["Test Coverage"] = "Good" if has_tests else "Weak"
    if not has_tests:
        improvements.append("Add unit/integration tests — no test files detected in recent activity")

    # ── Deployment readiness (15 pts) ────────────────────────────────────────
    tags = repo.get("tags") or []
    is_deployed = "deployed" in tags
    has_remote = bool(repo.get("remote_url"))
    deploy_score = (60 if has_remote else 20) + (40 if is_deployed else 0)
    deploy_pts = int(deploy_score * 0.15)
    pts += deploy_pts
    signals["Deployment Readiness"] = _level(deploy_score)
    if not is_deployed:
        improvements.append("Add a live demo URL or mark repo as deployed to increase recruiter confidence")

    # ── Documentation quality (10 pts) ───────────────────────────────────────
    has_install = readme.get("has_installation", False)
    has_usage = readme.get("has_usage", False)
    has_license = readme.get("has_license", False)
    doc_score = (
        (40 if has_install else 0) +
        (40 if has_usage else 0) +
        (20 if has_license else 0)
    )
    doc_pts = int(doc_score * 0.10)
    pts += doc_pts
    signals["Documentation Quality"] = _level(doc_score)
    if not has_license:
        improvements.append("Add a license file — required for open-source credibility")

    # ── Architecture maturity (10 pts) ───────────────────────────────────────
    total_files = fi.get("total_files", 0)
    token_count = fi.get("total_tokens", 0)
    arch_score = min(100, (total_files // 2) + (token_count // 50000))
    arch_score = min(arch_score, 100)
    arch_pts = int(arch_score * 0.10)
    pts += arch_pts
    signals["Architecture Maturity"] = _level(arch_score)

    # ── Project uniqueness (5 pts) ────────────────────────────────────────────
    topics = repo.get("topics") or []
    description = repo.get("description") or ""
    unique_score = min(100, len(topics) * 20 + (50 if description else 0))
    unique_pts = int(unique_score * 0.05)
    pts += unique_pts
    signals["Project Uniqueness"] = _level(unique_score)
    if not description:
        improvements.append("Add a short project description to help recruiters quickly understand the project")

    # ── Maintainability (5 pts) ────────────────────────────────────────────────
    maint_pts = int(health_score * 0.05)
    pts += maint_pts
    signals["Maintainability"] = _level(health_score)

    # ── Interview Probability ─────────────────────────────────────────────────
    if pts >= 80:
        interview_prob = "High"
    elif pts >= 60:
        interview_prob = "Moderate"
    else:
        interview_prob = "Low"
    signals["Interview Probability"] = interview_prob

    return {
        "portfolio_score": min(100, pts),
        "signals": signals,
        "improvements": improvements[:5],  # Top 5 most impactful
    }


# ---------------------------------------------------------------------------
# AI Commentary prompt builder
# ---------------------------------------------------------------------------

def build_recruiter_prompt(repo: dict, score_data: dict) -> str:
    name = repo.get("name", "this repo")
    score = score_data["portfolio_score"]
    signals = score_data["signals"]
    source = repo.get("source_type", "local_only")
    language = repo.get("language") or "unknown"
    token_count = (repo.get("file_intelligence") or {}).get("total_tokens", 0)
    stars = repo.get("github_stars", 0)
    desc = repo.get("description") or "No description provided."

    signal_text = "\n".join(f"  {k}: {v}" for k, v in signals.items())

    return f"""You are a senior technical recruiter at a top-tier tech company evaluating a developer's GitHub repository.

Evaluate this repository and write a short (4-6 sentence) human-style assessment in first person, as if you are speaking directly to the developer. Be honest, constructive, and specific. Reference the actual metrics.

Repository: {name}
Description: {desc}
Language: {language}
Source Type: {source}
GitHub Stars: {stars}
Codebase Size: ~{token_count // 1000}k tokens
Portfolio Score: {score}/100

Hiring Signals:
{signal_text}

Write your commentary now. Do NOT fabricate metrics not listed above. Sound like a real human recruiter, not a bot."""
