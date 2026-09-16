"""Agent configuration loader.

Non-secret settings live in agent/config.json (untracked; see
agent/config.example.json). Secrets — github_pat, gemini_api_key and the
agent API token — live in agent/.env (untracked) and are never written to
config.json. Environment variables with the RT_ prefix override both.
"""

import json
import os
import secrets
from pathlib import Path
from pydantic import field_validator
from pydantic_settings import BaseSettings


_AGENT_DIR = Path(__file__).parent
_CONFIG_PATH = _AGENT_DIR / "config.json"
_ENV_PATH = _AGENT_DIR / ".env"
_DEFAULT_DB_PATH = str(_AGENT_DIR / "repotracker.db")

# Keys that must never be persisted to config.json
SECRET_KEYS = {"github_pat", "gemini_api_key", "agent_token"}


def _load_config_json() -> dict:
    if _CONFIG_PATH.exists():
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_config_json(data: dict) -> None:
    clean = {k: v for k, v in data.items() if k not in SECRET_KEYS}
    with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(clean, f, indent=2)


def _read_env_file() -> dict[str, str]:
    values: dict[str, str] = {}
    if not _ENV_PATH.exists():
        return values
    for line in _ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values


def _write_env_file(values: dict[str, str]) -> None:
    lines = ["# RepoTracker agent secrets. Never commit this file."]
    lines += [f"{k}={v}" for k, v in sorted(values.items())]
    _ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _store_secrets(updates: dict[str, str]) -> None:
    """Upsert secrets into agent/.env as RT_<KEY>=value."""
    env = _read_env_file()
    for key, value in updates.items():
        env[f"RT_{key.upper()}"] = value
    _write_env_file(env)


class AgentConfig(BaseSettings):
    watched_folders: list[str] = []
    scan_interval_seconds: int = 300
    agent_port: int = 8001
    github_pat: str = ""
    ai_enabled: bool = False
    ai_mode: str = "auto"           # auto | ollama | gemini | disabled
    gemini_api_key: str = ""
    ollama_model: str = "llama3"
    gemini_model: str = "gemini-2.5-flash"
    agent_token: str = ""
    db_path: str = ""  # resolved to absolute at load time
    stale_threshold_days: int = 30
    dead_threshold_days: int = 90
    auto_fetch: bool = False            # background `git fetch` of upstream remotes
    fetch_interval_minutes: int = 60    # per repo, only when auto_fetch is on

    model_config = {"env_prefix": "RT_", "extra": "ignore"}

    @field_validator("watched_folders", mode="before")
    @classmethod
    def parse_folders(cls, v):
        if isinstance(v, str):
            return [x.strip() for x in v.split(",") if x.strip()]
        return v


def load_config() -> AgentConfig:
    """Load config.json, then secrets from agent/.env, then RT_ env vars."""
    json_data = _load_config_json()

    # One-time migration: move any secrets still sitting in config.json into .env
    leaked = {k: json_data.pop(k) for k in list(json_data) if k in SECRET_KEYS}
    leaked = {k: v for k, v in leaked.items() if v}
    if leaked:
        _store_secrets(leaked)
    if leaked or any(k in SECRET_KEYS for k in _load_config_json()):
        _save_config_json(json_data)

    env_file = _read_env_file()
    for key in SECRET_KEYS:
        value = os.environ.get(f"RT_{key.upper()}") or env_file.get(f"RT_{key.upper()}")
        if value:
            json_data[key] = value

    cfg = AgentConfig(**json_data)

    # Always resolve db_path to absolute based on agent dir, regardless of CWD
    if not cfg.db_path or not Path(cfg.db_path).is_absolute():
        cfg.db_path = _DEFAULT_DB_PATH

    # Generate the API token on first start; the Next.js server reads it from agent/.env
    if not cfg.agent_token:
        cfg.agent_token = secrets.token_urlsafe(32)
        _store_secrets({"agent_token": cfg.agent_token})

    return cfg


def update_config(updates: dict) -> AgentConfig:
    """Persist updates (secrets to agent/.env, the rest to config.json)."""
    secret_updates = {k: updates.pop(k) for k in list(updates) if k in SECRET_KEYS}
    secret_updates.pop("agent_token", None)  # never settable over the API
    if secret_updates:
        _store_secrets(secret_updates)

    current = _load_config_json()
    current.update(updates)
    _save_config_json(current)

    # Update the in-memory singleton in place so existing references in main.py see the changes
    for k, v in {**current, **secret_updates}.items():
        if hasattr(config, k):
            setattr(config, k, v)

    return config


# Module-level singleton
config = load_config()
