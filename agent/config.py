"""Agent configuration loader.

Reads agent/config.json and merges with environment variables.
Environment variables take precedence over config.json values.
"""

import json
import os
from pathlib import Path
from pydantic import field_validator
from pydantic_settings import BaseSettings


_CONFIG_PATH = Path(__file__).parent / "config.json"
_DEFAULT_DB_PATH = str(Path(__file__).parent / "repotracker.db")


def _load_config_json() -> dict:
    if _CONFIG_PATH.exists():
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_config_json(data: dict) -> None:
    with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


class AgentConfig(BaseSettings):
    watched_folders: list[str] = []
    scan_interval_seconds: int = 300
    agent_port: int = 8001
    github_pat: str = ""
    ai_enabled: bool = False
    ai_mode: str = "auto"           # auto | ollama | gemini | disabled
    gemini_api_key: str = ""
    ollama_model: str = "llama3"
    db_path: str = ""  # resolved to absolute at load time
    stale_threshold_days: int = 30
    dead_threshold_days: int = 90

    model_config = {"env_prefix": "RT_", "extra": "ignore"}

    @field_validator("watched_folders", mode="before")
    @classmethod
    def parse_folders(cls, v):
        if isinstance(v, str):
            return [x.strip() for x in v.split(",") if x.strip()]
        return v


def load_config() -> AgentConfig:
    """Load config from config.json, override with env vars."""
    json_data = _load_config_json()
    cfg = AgentConfig(**json_data)
    # Always resolve db_path to absolute based on agent dir, regardless of CWD
    if not cfg.db_path or not Path(cfg.db_path).is_absolute():
        cfg.db_path = _DEFAULT_DB_PATH
    return cfg


def update_config(updates: dict) -> AgentConfig:
    """Persist updates to config.json and return new config."""
    global config
    current = _load_config_json()
    current.update(updates)
    _save_config_json(current)
    
    # Update the in-memory singleton in-place so existing references in main.py see the changes
    for k, v in current.items():
        if hasattr(config, k):
            setattr(config, k, v)
            
    return config


# Module-level singleton
config = load_config()
