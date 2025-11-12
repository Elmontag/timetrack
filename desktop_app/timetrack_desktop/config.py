"""Konfigurations-Utilities für die Desktop-Anwendung."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

DEFAULT_API_BASE_URL = "http://127.0.0.1:8080"
DEFAULT_WEB_APP_URL = "http://127.0.0.1:5173"
DEFAULT_POLL_INTERVAL = 30


@dataclass(slots=True)
class AppConfig:
    """Konfigurationswerte für die Anwendung."""

    api_base_url: str = DEFAULT_API_BASE_URL
    api_token: Optional[str] = None
    web_app_url: str = DEFAULT_WEB_APP_URL
    polling_interval_seconds: int = DEFAULT_POLL_INTERVAL


def load_config() -> AppConfig:
    """Lädt die Konfiguration aus einer optionalen `.env` Datei."""

    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)

    return AppConfig(
        api_base_url=os.getenv("TIMETRACK_API_BASE_URL", DEFAULT_API_BASE_URL),
        api_token=os.getenv("TIMETRACK_API_TOKEN"),
        web_app_url=os.getenv("TIMETRACK_WEB_APP_URL", DEFAULT_WEB_APP_URL),
        polling_interval_seconds=int(os.getenv("TIMETRACK_POLL_INTERVAL", DEFAULT_POLL_INTERVAL)),
    )


__all__ = ["AppConfig", "load_config"]
