from __future__ import annotations

import ipaddress
import os
from pathlib import Path
from typing import List, Optional

from pydantic import Field, computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)
    """Application runtime configuration."""

    app_name: str = "TimeTrack"
    environment: str = "development"
    host: str = os.getenv("TT_HOST", "127.0.0.1")
    port: int = int(os.getenv("TT_PORT", "8080"))
    block_ips: List[str] = Field(
        default_factory=lambda: [ip.strip() for ip in os.getenv("TT_BLOCK_IPS", "").split(",") if ip.strip()]
    )
    behind_proxy: bool = os.getenv("TT_BEHIND_PROXY", "false").lower() == "true"

    storage_backend: str = os.getenv("TT_STORAGE", "sqlite")
    sqlite_path: Path = Path(os.getenv("TT_SQLITE_PATH", "./data/timetrack.db"))
    json_dir: Path = Path(os.getenv("TT_JSON_DIR", "./data/state"))

    export_dir: Path = Path(os.getenv("TT_EXPORT_DIR", "./data/exports"))
    export_pdf_engine: str = os.getenv("TT_EXPORT_PDF_ENGINE", "reportlab")
    export_xlsx_engine: str = os.getenv("TT_EXPORT_XLSX_ENGINE", "openpyxl")

    caldav_url: Optional[str] = os.getenv("TT_CALDAV_URL")
    caldav_user: Optional[str] = os.getenv("TT_CALDAV_USER")
    caldav_password: Optional[str] = os.getenv("TT_CALDAV_PASSWORD")
    caldav_default_cal: Optional[str] = os.getenv("TT_CALDAV_DEFAULT_CAL")

    locale: str = os.getenv("TT_LOCALE", "de-DE")
    timezone: str = os.getenv("TZ", "Europe/Berlin")

    expected_daily_hours: float = float(os.getenv("TT_EXPECTED_DAILY_HOURS", "8"))
    expected_weekly_hours: Optional[float] = (
        float(os.getenv("TT_EXPECTED_WEEKLY_HOURS"))
        if os.getenv("TT_EXPECTED_WEEKLY_HOURS")
        else None
    )

    token_secret: str = os.getenv("TT_TOKEN_SECRET", "change-me")

    rate_limit_per_minute: int = int(os.getenv("TT_RATE_LIMIT", "60"))

    @field_validator("block_ips", mode="before")
    @classmethod
    def _split_block_ips(cls, value: str | List[str]) -> List[str]:
        if isinstance(value, list):
            return value
        if not value:
            return []
        return [ip.strip() for ip in value.split(",") if ip.strip()]

    @computed_field
    def block_networks(self) -> List[ipaddress._BaseNetwork]:
        networks: List[ipaddress._BaseNetwork] = []
        for entry in self.block_ips:
            try:
                networks.append(ipaddress.ip_network(entry, strict=False))
            except ValueError:
                # Single IPs fallback
                networks.append(ipaddress.ip_network(f"{entry}/32", strict=False))
        return networks


settings = Settings()

# Ensure essential directories exist
settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
settings.export_dir.mkdir(parents=True, exist_ok=True)
settings.json_dir.mkdir(parents=True, exist_ok=True)
