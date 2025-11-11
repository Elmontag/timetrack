from __future__ import annotations

import ipaddress
import json
from threading import RLock
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from .config import Settings
from .models import AppSetting


class RuntimeState:
    """Mutable runtime configuration that can be adjusted at runtime."""

    def __init__(self, base_settings: Settings):
        self._lock = RLock()
        self._block_ips: List[str] = list(base_settings.block_ips)
        self._block_networks = self._build_networks(self._block_ips)
        self.caldav_url: Optional[str] = base_settings.caldav_url
        self.caldav_user: Optional[str] = base_settings.caldav_user
        self.caldav_password: Optional[str] = base_settings.caldav_password
        self.caldav_default_cal: Optional[str] = base_settings.caldav_default_cal

    @property
    def block_ips(self) -> List[str]:
        with self._lock:
            return list(self._block_ips)

    @property
    def block_networks(self) -> Iterable[ipaddress._BaseNetwork]:
        with self._lock:
            return list(self._block_networks)

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "block_ips": list(self._block_ips),
                "caldav_url": self.caldav_url or "",
                "caldav_user": self.caldav_user or "",
                "caldav_default_cal": self.caldav_default_cal or "",
                "caldav_password_set": bool(self.caldav_password),
            }

    def apply(self, updates: Dict[str, Any]) -> None:
        with self._lock:
            if "block_ips" in updates and updates["block_ips"] is not None:
                block_ips = [ip.strip() for ip in updates["block_ips"] if ip.strip()]
                self._block_ips = block_ips
                self._block_networks = self._build_networks(block_ips)
            if "caldav_url" in updates:
                self.caldav_url = updates.get("caldav_url") or None
            if "caldav_user" in updates:
                self.caldav_user = updates.get("caldav_user") or None
            if "caldav_password" in updates:
                password = updates.get("caldav_password")
                if password == "__UNCHANGED__":
                    pass
                else:
                    self.caldav_password = password or None
            if "caldav_default_cal" in updates:
                self.caldav_default_cal = updates.get("caldav_default_cal") or None

    def load_from_db(self, session: Session) -> None:
        records = session.query(AppSetting).all()
        if not records:
            return
        decoded: Dict[str, Any] = {}
        for record in records:
            if record.key == "block_ips":
                decoded["block_ips"] = json.loads(record.value)
            elif record.key in {
                "caldav_url",
                "caldav_user",
                "caldav_password",
                "caldav_default_cal",
            }:
                decoded[record.key] = record.value
        if decoded:
            self.apply(decoded)

    def persist(self, session: Session, updates: Dict[str, Any]) -> None:
        for key, value in updates.items():
            if value is None:
                value = ""
            if key == "block_ips":
                value = json.dumps([ip.strip() for ip in value if ip.strip()])
            if key == "caldav_password" and value == "__UNCHANGED__":
                continue
            record = session.query(AppSetting).filter(AppSetting.key == key).one_or_none()
            if record:
                record.value = value
            else:
                session.add(AppSetting(key=key, value=value))
        session.commit()

    @staticmethod
    def _build_networks(entries: List[str]) -> List[ipaddress._BaseNetwork]:
        networks: List[ipaddress._BaseNetwork] = []
        for entry in entries:
            try:
                networks.append(ipaddress.ip_network(entry, strict=False))
            except ValueError:
                try:
                    networks.append(ipaddress.ip_network(f"{entry}/32", strict=False))
                except ValueError:
                    continue
        return networks
