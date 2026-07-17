"""Optional AI layer — guarded by RT_AI_ENABLED env flag.

Uses Adaptive AI Routing (Ollama/Gemini) to generate:
- Weekly summaries
- Smart suggestions per repo
- Natural language repo queries

AI outputs MUST cite actual metrics (rules §15).
When AI is disabled this module is a no-op.
"""

from __future__ import annotations
import logging
from typing import Optional
from agent.config import config
from agent.ai_orchestrator import generate

logger = logging.getLogger(__name__)


def _can_generate() -> bool:
    return config.ai_enabled and config.ai_mode != "disabled"


async def generate_weekly_summary(repo_summaries: list[dict]) -> str:
    """Generate a weekly activity summary grounded in real metrics."""
    if not _can_generate():
        return ""

    metrics_text = "\n".join(
        f"- {r['name']}: health={r.get('health', '?')}, "
        f"commits_7d={r.get('commits_7d', 0)}, "
        f"staleness={r.get('staleness_risk', 'unknown')}"
        for r in repo_summaries
    )

    prompt = (
        "You are RepoTracker's AI assistant. Based on the following real metrics, "
        "write a short (3–5 sentences) developer activity summary for this week. "
        "Only reference the metrics provided. Do not invent numbers.\n\n"
        f"Metrics:\n{metrics_text}"
    )

    try:
        text, provider = await generate(
            prompt,
            ai_mode=config.ai_mode,
            gemini_api_key=config.gemini_api_key,
            ollama_model=config.ollama_model
        )
        return text
    except Exception as exc:
        logger.warning("AI weekly summary failed: %s", exc)
        return ""


async def generate_repo_suggestion(repo: dict) -> str:
    """Generate a specific actionable suggestion for one repo."""
    if not _can_generate():
        return ""

    prompt = (
        "You are RepoTracker's AI assistant. Based on these metrics for the repo "
        f"'{repo.get('name')}', give one short actionable suggestion (1 sentence).\n\n"
        f"Health: {repo.get('health_score', '?')}/100\n"
        f"Staleness risk: {repo.get('staleness_risk', '?')}\n"
        f"Uncommitted changes: {repo.get('uncommitted_changes', 0)}\n"
        f"Local ahead by: {repo.get('local_ahead_by', 0)} commits\n"
        f"README score: {repo.get('readme_score', '?')}/100\n"
        "Only reference the metrics provided."
    )

    try:
        text, provider = await generate(
            prompt,
            ai_mode=config.ai_mode,
            gemini_api_key=config.gemini_api_key,
            ollama_model=config.ollama_model
        )
        return text
    except Exception as exc:
        logger.warning("AI repo suggestion failed: %s", exc)
        return ""


async def answer_repo_query(question: str, repos: list[dict]) -> str:
    """Natural language query over repo data — always grounded in real data."""
    if not _can_generate():
        return "AI layer is disabled. Enable it in Settings."

    repo_context = "\n".join(
        f"- {r['name']}: health={r.get('health_score', '?')}, "
        f"staleness={r.get('staleness_risk', '?')}, "
        f"last_activity={r.get('latest_activity_at', 'unknown')}, "
        f"source_type={r.get('source_type', '?')}, "
        f"tags={r.get('tags', [])}"
        for r in repos
    )

    prompt = (
        "You are RepoTracker's AI assistant. Answer the user's question using only "
        "the repo data below. Do not make up metrics.\n\n"
        f"Repos:\n{repo_context}\n\n"
        f"Question: {question}"
    )

    try:
        text, provider = await generate(
            prompt,
            ai_mode=config.ai_mode,
            gemini_api_key=config.gemini_api_key,
            ollama_model=config.ollama_model
        )
        return text
    except Exception as exc:
        logger.warning("AI query failed: %s", exc)
        return f"AI error: {exc}"
