"""Tests for agent/health.py — Scoring Engine."""

from datetime import datetime, timezone, timedelta
import pytest

from agent.health import compute_health, compute_momentum, compute_staleness


def _iso(days_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


class TestHealthScore:
    def test_active_repo_scores_high(self):
        h = compute_health(
            latest_activity_iso=_iso(1),
            uncommitted_changes=0,
            has_readme=True,
            stale_branch_count=0,
        )
        assert h.score >= 70
        assert h.level in ("good", "excellent")

    def test_dead_repo_scores_low(self):
        h = compute_health(
            latest_activity_iso=_iso(120),
            uncommitted_changes=0,
            has_readme=False,
            stale_branch_count=3,
        )
        assert h.score <= 30
        assert h.level in ("poor", "critical")

    def test_score_clamped_to_0_100(self):
        # Worst possible scenario
        h = compute_health(
            latest_activity_iso=_iso(200),
            uncommitted_changes=50,
            has_readme=False,
            stale_branch_count=10,
        )
        assert 0 <= h.score <= 100

    def test_readme_gives_bonus(self):
        with_readme = compute_health(_iso(10), 0, True, 0)
        without_readme = compute_health(_iso(10), 0, False, 0)
        assert with_readme.score > without_readme.score

    def test_uncommitted_changes_penalty(self):
        clean = compute_health(_iso(1), 0, True, 0)
        dirty_small = compute_health(_iso(1), 10, True, 0)
        dirty_large = compute_health(_iso(1), 25, True, 0)
        assert clean.score > dirty_small.score > dirty_large.score

    def test_stale_branches_penalty(self):
        no_stale = compute_health(_iso(1), 0, True, 0)
        with_stale = compute_health(_iso(1), 0, True, 3)
        assert no_stale.score > with_stale.score

    def test_no_activity_detected(self):
        h = compute_health(None, 0, False, 0)
        assert h.score < 50  # penalty applied

    def test_breakdown_has_reasons(self):
        h = compute_health(_iso(100), 15, False, 2)
        assert len(h.breakdown.reasons) > 0

    def test_recent_commit_bonus(self):
        very_recent = compute_health(_iso(1), 0, False, 0)
        week_old = compute_health(_iso(5), 0, False, 0)
        older = compute_health(_iso(20), 0, False, 0)
        assert very_recent.score > week_old.score > older.score

    def test_level_labels(self):
        assert compute_health(_iso(1), 0, True, 0).level == "excellent"
        assert compute_health(_iso(120), 30, False, 5).level in ("critical", "poor")


class TestMomentumScore:
    def test_growing_momentum(self):
        m = compute_momentum(commits_last_4w=20, commits_prev_4w=10)
        assert m.level == "growing"
        assert m.change_pct > 0

    def test_declining_momentum(self):
        m = compute_momentum(commits_last_4w=5, commits_prev_4w=20)
        assert m.level == "declining"
        assert m.change_pct < 0

    def test_stable_momentum(self):
        m = compute_momentum(commits_last_4w=10, commits_prev_4w=10)
        assert m.level == "stable"

    def test_new_activity_after_silence(self):
        m = compute_momentum(commits_last_4w=5, commits_prev_4w=0)
        assert m.level == "growing"

    def test_both_zero(self):
        m = compute_momentum(commits_last_4w=0, commits_prev_4w=0)
        assert m.level == "stable"

    def test_reason_is_non_empty(self):
        m = compute_momentum(10, 5)
        assert len(m.reason) > 10


class TestStalenessInfo:
    def test_recent_is_low_risk(self):
        s = compute_staleness(_iso(3), 30, 90)
        assert s.risk == "low"

    def test_moderate_risk(self):
        s = compute_staleness(_iso(20), 30, 90)
        assert s.risk == "moderate"

    def test_high_risk(self):
        s = compute_staleness(_iso(60), 30, 90)
        assert s.risk == "high"

    def test_critical_risk(self):
        s = compute_staleness(_iso(120), 30, 90)
        assert s.risk == "critical"

    def test_none_activity_is_critical(self):
        s = compute_staleness(None, 30, 90)
        assert s.risk == "critical"

    def test_days_until_stale_positive_when_not_stale(self):
        s = compute_staleness(_iso(5), 30, 90)
        assert s.days_until_stale > 0

    def test_days_until_dead_negative_when_dead(self):
        s = compute_staleness(_iso(100), 30, 90)
        assert s.days_until_dead < 0

    def test_custom_thresholds(self):
        s = compute_staleness(_iso(8), stale_threshold_days=7, dead_threshold_days=14)
        assert s.risk == "high"



class TestRecruiterScoring:
    def _repo(self, **overrides):
        repo = {
            "readme": {"score": 100, "has_installation": True, "has_usage": True,
                       "has_license": True, "has_description": True},
            "health": {"score": 80},
            "staleness": {"risk": "low"},
            "momentum": {"level": "growing"},
            "file_intelligence": {"has_tests": True, "test_file_count": 9,
                                  "structure_signals": ["CI workflow", "test suite", "linter config"],
                                  "total_files": 40, "total_tokens": 100000},
            "tags": ["active"],
            "remote_url": "https://github.com/me/app.git",
            "description": "Does a thing",
        }
        repo.update(overrides)
        return repo

    def test_old_but_tested_repo_still_scores_for_tests(self):
        from agent.recruiter import compute_recruiter_score

        old_repo = self._repo(staleness={"risk": "high"}, file_intelligence={
            "has_tests": True, "test_file_count": 12, "structure_signals": ["test suite"],
            "recently_modified": [],  # nothing touched this week
        })
        assert compute_recruiter_score(old_repo)["signals"]["Test Coverage"] == "Strong"

    def test_no_tests_is_flagged(self):
        from agent.recruiter import compute_recruiter_score

        result = compute_recruiter_score(self._repo(file_intelligence={"has_tests": False, "test_file_count": 0}))
        assert result["signals"]["Test Coverage"] == "Weak"
        assert any("tests" in improvement for improvement in result["improvements"])

    def test_deployed_tag_raises_the_score(self):
        from agent.recruiter import compute_recruiter_score

        plain = compute_recruiter_score(self._repo())
        deployed = compute_recruiter_score(self._repo(tags=["active", "deployed"]))
        assert deployed["portfolio_score"] > plain["portfolio_score"]

    def test_no_invented_interview_metric(self):
        from agent.recruiter import compute_recruiter_score

        signals = compute_recruiter_score(self._repo())["signals"]
        assert "Interview Probability" not in signals
        assert signals["Portfolio Readiness"].startswith(("Strong", "Solid", "Early"))


class TestDeployedExemption:
    """A repo marked deployed is finished on purpose; silence must not be scored as decay."""

    def test_inactivity_penalty_does_not_apply(self):
        from agent.health import compute_health

        stale = compute_health(_iso(153), 6, True, 0)
        deployed = compute_health(_iso(153), 6, True, 0, deployed=True)

        assert stale.score == 35
        assert deployed.score == 80  # no inactivity penalty, plus the stability bonus
        assert deployed.breakdown.no_activity_penalty == 0
        assert deployed.breakdown.commit_recency_bonus == 20
        assert any("deployed" in r for r in deployed.breakdown.reasons)

    def test_real_problems_still_count(self):
        from agent.health import compute_health

        deployed = compute_health(_iso(153), 30, False, 2, deployed=True)

        assert deployed.breakdown.uncommitted_penalty == -20  # uncommitted work still counts
        assert deployed.breakdown.readme_bonus == 0           # missing README still costs
        assert deployed.breakdown.stale_branch_penalty == -20 # stale branches still count

    def test_staleness_is_reported_as_low(self):
        from agent.health import compute_staleness

        info = compute_staleness(_iso(153), deployed=True)

        assert info.risk == "low"
        assert info.days_since_activity == 153  # the real figure is still reported
        assert "deployed" in info.message.lower()

    def test_momentum_is_not_tracked(self):
        from agent.health import compute_momentum

        momentum = compute_momentum(0, 12, deployed=True)

        assert momentum.level == "stable"
        assert "deployed" in momentum.reason.lower()

    def test_deployed_repo_is_not_labelled_active(self, tmp_path):
        import git
        from agent.scanner import _scan_repo

        repo = git.Repo.init(str(tmp_path))
        repo.config_writer().set_value("user", "name", "T").release()
        repo.config_writer().set_value("user", "email", "t@t.com").release()
        (tmp_path / "README.md").write_text("# Shipped")
        repo.index.add(["README.md"])
        repo.index.commit("ship")

        record, _ = _scan_repo(str(tmp_path), 30, 90, deployed=True)

        assert "deployed" in record.tags
        assert "active" not in record.tags
        assert "stale" not in record.tags
