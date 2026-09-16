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

Provider order in auto mode: Ollama first (local, private, free), Gemini as fallback.

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

# model -> (checked_at, healthy)
_ollama_health_cache: dict[str, tuple[float, bool]] = {}

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

async def _ollama_healthy(model: str = "llama3", ttl: float = 30.0) -> bool:
    """Check if Ollama is running with the requested model. Cached briefly: this runs per request."""
    cached = _ollama_health_cache.get(model)
    now = time.monotonic()
    if cached and now - cached[0] < ttl:
        return cached[1]
    try:
        import ollama  # type: ignore
        client = ollama.AsyncClient()
        models = await asyncio.wait_for(client.list(), timeout=3.0)
        names = [m.model.split(":")[0] for m in (models.models or [])]
        healthy = model.split(":")[0] in names
    except Exception:
        healthy = False
    _ollama_health_cache[model] = (now, healthy)
    return healthy


# ---------------------------------------------------------------------------
# Gemini call
# ---------------------------------------------------------------------------

async def _call_gemini(prompt: str, api_key: str, model: str = "gemini-2.5-flash") -> str:
    """Call Gemini through the current google-genai SDK, falling back to the legacy one."""
    try:
        from google import genai  # type: ignore

        client = genai.Client(api_key=api_key)
        response = await asyncio.to_thread(
            client.models.generate_content, model=model, contents=prompt
        )
        text = response.text or ""
    except ImportError:
        import google.generativeai as legacy  # type: ignore

        legacy.configure(api_key=api_key)
        legacy_model = legacy.GenerativeModel(model)
        response = await asyncio.to_thread(legacy_model.generate_content, prompt)
        text = response.text or ""
    _stats["gemini_requests"] += 1
    return text


async def gemini_reachable(api_key: str, model: str) -> tuple[bool, str]:
    """Verify the key and model with one tiny call. Returns (ok, detail)."""
    if not api_key:
        return (False, "no API key set")
    try:
        await _call_gemini("ping", api_key=api_key, model=model)
        _stats["gemini_requests"] -= 1  # a health check is not a real request
        return (True, model)
    except Exception as exc:
        return (False, type(exc).__name__)


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
    gemini_model: str = "gemini-2.5-flash",
) -> tuple[str, str]:
    """Generate a response using the best available AI provider.
    Returns (text, provider_name) where provider_name is one of:
      "ollama", "gemini", "local"
    """
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
            text = await _call_gemini(prompt, api_key=gemini_api_key, model=gemini_model)
            return (text, "gemini")
        except Exception as exc:
            logger.warning("Gemini-only mode failed: %s", exc)
            _stats["local_fallbacks"] += 1
            return ("", "local")

    # ── Auto Mode: local first, cloud as fallback ────────────────────────────
    if await _ollama_healthy(ollama_model):
        try:
            return (await _call_ollama(prompt, model=ollama_model), "ollama")
        except Exception as exc:
            logger.warning("Ollama failed, trying Gemini: %s", exc)

    if gemini_api_key:
        try:
            return (await _call_gemini(prompt, api_key=gemini_api_key, model=gemini_model), "gemini")
        except Exception as exc:
            logger.warning("Gemini also failed: %s", exc)

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
