"""Explainable Health, Momentum, and Staleness scoring engine.

Rules §9: Every score must explain WHY it changed.
Black-box scoring is forbidden.

Health Score (0–100):
  Base: 50 pts
  +20  committed in last 3 days
  +10  committed in last 7 days (non-overlapping)
  +10  has README
  +10  no stale branches (none > 30 days inactive)
  -10  per stale branch (max -30)
  -10  uncommitted changes > 5 files
  -10  uncommitted changes > 20 files (stacked)
  -15  last commit 30–90 days ago
  -25  last commit > 90 days ago
  Clamped to [0, 100].

Momentum: compare last 4 weeks vs prior 4 weeks.
Staleness: based on days since latest_activity.
"""

from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Optional

from agent.models import (
    HealthScore,
    HealthBreakdown,
    MomentumScore,
    StalenessInfo,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _days_ago(dt: Optional[datetime]) -> Optional[float]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (_now() - dt).total_seconds() / 86_400


def _parse_ts(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def _health_level(score: int) -> str:
    if score >= 85:
        return "excellent"
    if score >= 70:
        return "good"
    if score >= 50:
        return "fair"
    if score >= 30:
        return "poor"
    return "critical"


def compute_health(
    latest_activity_iso: Optional[str],
    uncommitted_changes: int,
    has_readme: bool,
    stale_branch_count: int,
) -> HealthScore:
    """Compute explainable health score."""
    base = 50
    reasons: list[str] = []
    breakdown = HealthBreakdown(base_score=base)

    days = _days_ago(_parse_ts(latest_activity_iso))

    # Commit recency bonus
    if days is not None:
        if days <= 3:
            breakdown.commit_recency_bonus = 20
            reasons.append("Active commit in last 3 days (+20)")
        elif days <= 7:
            breakdown.commit_recency_bonus = 10
            reasons.append("Commit in last 7 days (+10)")

    # README bonus
    if has_readme:
        breakdown.readme_bonus = 10
        reasons.append("README present (+10)")
    else:
        reasons.append("No README found (missed +10)")

    # Stale branch penalty
    stale_penalty = min(stale_branch_count * 10, 30)
    if stale_branch_count > 0:
        breakdown.stale_branch_penalty = -stale_penalty
        reasons.append(f"{stale_branch_count} stale branch(es) (−{stale_penalty})")

    # Uncommitted changes penalty
    uncommitted_penalty = 0
    if uncommitted_changes > 20:
        uncommitted_penalty = 20
        reasons.append(f"{uncommitted_changes} uncommitted files (−20)")
    elif uncommitted_changes > 5:
        uncommitted_penalty = 10
        reasons.append(f"{uncommitted_changes} uncommitted files (−10)")
    breakdown.uncommitted_penalty = -uncommitted_penalty

    # Inactivity penalty
    inactivity_penalty = 0
    if days is not None:
        if days > 90:
            inactivity_penalty = 25
            reasons.append(f"No activity for {int(days)} days (−25)")
        elif days > 30:
            inactivity_penalty = 15
            reasons.append(f"No activity for {int(days)} days (−15)")
    elif days is None:
        inactivity_penalty = 25
        reasons.append("No commit history detected (−25)")
    breakdown.no_activity_penalty = -inactivity_penalty

    score = (
        base
        + breakdown.commit_recency_bonus
        + breakdown.readme_bonus
        + breakdown.stale_branch_penalty
        + breakdown.uncommitted_penalty
        + breakdown.no_activity_penalty
    )
    score = max(0, min(100, score))
    breakdown.reasons = reasons

    return HealthScore(
        score=score,
        breakdown=breakdown,
        level=_health_level(score),
    )


def compute_momentum(
    commits_last_4w: int,
    commits_prev_4w: int,
) -> MomentumScore:
    """Growing / stable / declining based on commit volume shift."""
    if commits_prev_4w == 0:
        if commits_last_4w == 0:
            change_pct = 0.0
            level = "stable"
            reason = "No commits in either 4-week window — project is idle."
        else:
            change_pct = 100.0
            level = "growing"
            reason = f"New activity after silence: {commits_last_4w} commits this period."
    else:
        change_pct = ((commits_last_4w - commits_prev_4w) / commits_prev_4w) * 100
        if change_pct >= 20:
            level = "growing"
            reason = f"Commits up {change_pct:.0f}% vs prior 4 weeks ({commits_last_4w} vs {commits_prev_4w})."
        elif change_pct <= -20:
            level = "declining"
            reason = f"Commits down {abs(change_pct):.0f}% vs prior 4 weeks ({commits_last_4w} vs {commits_prev_4w})."
        else:
            level = "stable"
            reason = f"Commit volume stable ({commits_last_4w} vs {commits_prev_4w} prior 4 weeks)."

    return MomentumScore(
        level=level,
        commit_count_last_4w=commits_last_4w,
        commit_count_prev_4w=commits_prev_4w,
        change_pct=round(change_pct, 1),
        reason=reason,
    )


def compute_staleness(
    latest_activity_iso: Optional[str],
    stale_threshold_days: int = 30,
    dead_threshold_days: int = 90,
) -> StalenessInfo:
    """How close is this repo to dying?"""
    days = _days_ago(_parse_ts(latest_activity_iso))

    if days is None:
        return StalenessInfo(
            risk="critical",
            days_since_activity=0,
            days_until_stale=-stale_threshold_days,
            days_until_dead=-dead_threshold_days,
            message="No activity detected. Consider archiving or starting fresh.",
        )

    days_int = int(days)
    days_until_stale = stale_threshold_days - days_int
    days_until_dead = dead_threshold_days - days_int

    if days > dead_threshold_days:
        risk = "critical"
        message = f"Last activity {days_int} days ago. This repo may be abandoned."
    elif days > stale_threshold_days:
        risk = "high"
        message = f"Last activity {days_int} days ago. At risk of going dead in {days_until_dead} days."
    elif days > 14:
        risk = "moderate"
        message = f"Last activity {days_int} days ago. Stale in {days_until_stale} days if no action."
    else:
        risk = "low"
        message = f"Recently active ({days_int} days ago). Looking healthy."

    return StalenessInfo(
        risk=risk,
        days_since_activity=days_int,
        days_until_stale=days_until_stale,
        days_until_dead=days_until_dead,
        message=message,
    )
