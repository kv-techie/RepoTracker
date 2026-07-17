"""Adaptive AI Routing™ — ProviderManager

Routes AI tasks to the best available provider:
  1. Ollama  (local, private, free, unlimited)
  2. Gemini  (cloud, Google AI Studio, fallback)
  3. Local   (rule-based, always available)

Routing logic:
  - ai_mode = "auto"    → task-based + health-based fallback
  - ai_mode = "ollama"  → Ollama only (error if offline)
  - ai_mode = "gemini"  → Gemini only
  - ai_mode = "disabled"→ no AI, local only

Token budget routing (auto mode):
  - prompt_tokens < 8000 → Gemini (fast, cheap)
  - prompt_tokens >= 8000 → Ollama (handles large context)

Tracks request counts for the /ai/stats endpoint.
"""

from __future__ import annotations
import asyncio
import json
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Usage tracking (in-memory, reset on restart)
# ---------------------------------------------------------------------------

_stats: dict[str, int] = {
    "ollama_requests": 0,
    "gemini_requests": 0,
    "local_fallbacks": 0,
}


def get_ai_stats() -> dict:
    return dict(_stats)


# ---------------------------------------------------------------------------
# Ollama health check
# ---------------------------------------------------------------------------

async def _ollama_healthy(model: str = "llama3") -> bool:
    """Check if Ollama is running and has the requested model loaded."""
    try:
        import ollama  # type: ignore
        client = ollama.AsyncClient()
        models = await asyncio.wait_for(client.list(), timeout=3.0)
        names = [m.model.split(":")[0] for m in (models.models or [])]
        return model.split(":")[0] in names
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Gemini call
# ---------------------------------------------------------------------------

async def _call_gemini(prompt: str, api_key: str) -> str:
    import google.generativeai as genai  # type: ignore
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")
    response = await asyncio.to_thread(model.generate_content, prompt)
    _stats["gemini_requests"] += 1
    return response.text or ""


# ---------------------------------------------------------------------------
# Ollama call
# ---------------------------------------------------------------------------

async def _call_ollama(prompt: str, model: str = "llama3") -> str:
    import ollama  # type: ignore
    client = ollama.AsyncClient()
    response = await asyncio.wait_for(
        client.chat(
            model=model,
            messages=[{"role": "user", "content": prompt}],
        ),
        timeout=60.0,
    )
    _stats["ollama_requests"] += 1
    return response.message.content or ""


# ---------------------------------------------------------------------------
# ProviderManager — main entry point
# ---------------------------------------------------------------------------

async def generate(
    prompt: str,
    *,
    ai_mode: str,
    gemini_api_key: str = "",
    ollama_model: str = "llama3",
) -> tuple[str, str]:
    """
    Generate a response using the best available AI provider.
    Returns (text, provider_name) where provider_name is one of:
      "ollama", "gemini", "local"
    """
    prompt_tokens = len(prompt) // 4  # rough estimate

    if ai_mode == "disabled":
        _stats["local_fallbacks"] += 1
        return ("", "local")

    # ── Ollama Only ──────────────────────────────────────────────────────────
    if ai_mode == "ollama":
        try:
            text = await _call_ollama(prompt, model=ollama_model)
            return (text, "ollama")
        except Exception as exc:
            logger.warning("Ollama-only mode failed: %s", exc)
            _stats["local_fallbacks"] += 1
            return ("", "local")

    # ── Gemini Only ──────────────────────────────────────────────────────────
    if ai_mode == "gemini":
        if not gemini_api_key:
            logger.warning("Gemini selected but no API key configured.")
            _stats["local_fallbacks"] += 1
            return ("", "local")
        try:
            text = await _call_gemini(prompt, api_key=gemini_api_key)
            return (text, "gemini")
        except Exception as exc:
            logger.warning("Gemini-only mode failed: %s", exc)
            _stats["local_fallbacks"] += 1
            return ("", "local")

    # ── Auto Mode (task + health based) ─────────────────────────────────────
    # Large context → prefer Ollama
    if prompt_tokens >= 8000:
        if await _ollama_healthy(ollama_model):
            try:
                text = await _call_ollama(prompt, model=ollama_model)
                return (text, "ollama")
            except Exception as exc:
                logger.warning("Ollama failed for large context, trying Gemini: %s", exc)

        if gemini_api_key:
            try:
                text = await _call_gemini(prompt, api_key=gemini_api_key)
                return (text, "gemini")
            except Exception as exc:
                logger.warning("Gemini also failed: %s", exc)

        _stats["local_fallbacks"] += 1
        return ("", "local")

    # Small context → prefer Gemini (fast, cheap)
    if gemini_api_key:
        try:
            text = await _call_gemini(prompt, api_key=gemini_api_key)
            return (text, "gemini")
        except Exception as exc:
            logger.warning("Gemini failed for small task, trying Ollama: %s", exc)

    if await _ollama_healthy(ollama_model):
        try:
            text = await _call_ollama(prompt, model=ollama_model)
            return (text, "ollama")
        except Exception as exc:
            logger.warning("Ollama also failed: %s", exc)

    _stats["local_fallbacks"] += 1
    return ("", "local")
