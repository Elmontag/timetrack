from __future__ import annotations

import ipaddress
import json
from threading import RLock
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy.orm import Session

from .config import Settings, DEFAULT_TRAVEL_LETTER_TEMPLATE
from .models import AppSetting
from .utils import normalize_calendar_identifier, normalize_calendar_selection


CONTACT_FIELDS = (
    "name",
    "company",
    "department",
    "street",
    "postal_code",
    "city",
    "phone",
    "email",
)


def _normalize_contact(value: Optional[Dict[str, Any]]) -> Dict[str, str]:
    normalized: Dict[str, str] = {}
    if isinstance(value, dict):
        for field in CONTACT_FIELDS:
            raw = value.get(field)
            normalized[field] = raw.strip() if isinstance(raw, str) else ""
    else:
        for field in CONTACT_FIELDS:
            normalized[field] = ""
    return normalized


def _normalize_template(value: Optional[Dict[str, Any]]) -> Dict[str, str]:
    template = dict(DEFAULT_TRAVEL_LETTER_TEMPLATE)
    if isinstance(value, dict):
        subject = value.get("subject")
        body = value.get("body")
        if isinstance(subject, str):
            template["subject"] = subject
        if isinstance(body, str):
            template["body"] = body
    return template


class RuntimeState:
    """Mutable runtime configuration that can be adjusted at runtime."""

    def __init__(self, base_settings: Settings):
        self._lock = RLock()
        self._block_ips: List[str] = list(base_settings.block_ips)
        self._block_networks = self._build_networks(self._block_ips)
        self.caldav_url: Optional[str] = base_settings.caldav_url
        self.caldav_user: Optional[str] = base_settings.caldav_user
        self.caldav_password: Optional[str] = base_settings.caldav_password
        base_selection = normalize_calendar_selection(base_settings.caldav_selected_calendars)
        default_cal = normalize_calendar_identifier(base_settings.caldav_default_cal)
        if not base_selection and default_cal:
            base_selection = [default_cal]
        self.caldav_selected_calendars: List[str] = base_selection
        self.caldav_default_cal: Optional[str] = default_cal
        self.expected_daily_hours: Optional[float] = base_settings.expected_daily_hours
        self.expected_weekly_hours: Optional[float] = base_settings.expected_weekly_hours
        self.vacation_days_per_year: float = base_settings.vacation_days_per_year
        self.vacation_days_carryover: float = base_settings.vacation_days_carryover
        self.travel_sender_contact: Dict[str, str] = _normalize_contact(base_settings.travel_sender_contact)
        self.travel_hr_contact: Dict[str, str] = _normalize_contact(base_settings.travel_hr_contact)
        self.travel_letter_template: Dict[str, str] = _normalize_template(base_settings.travel_letter_template)
        self.day_overview_refresh_seconds: int = max(1, int(base_settings.day_overview_refresh_seconds))

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
                "caldav_selected_calendars": list(self.caldav_selected_calendars),
                "caldav_password_set": bool(self.caldav_password),
                "expected_daily_hours": self.expected_daily_hours,
                "expected_weekly_hours": self.expected_weekly_hours,
                "vacation_days_per_year": self.vacation_days_per_year,
                "vacation_days_carryover": self.vacation_days_carryover,
                "day_overview_refresh_seconds": self.day_overview_refresh_seconds,
                "travel_sender_contact": dict(self.travel_sender_contact),
                "travel_hr_contact": dict(self.travel_hr_contact),
                "travel_letter_template": dict(self.travel_letter_template),
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
                self.caldav_default_cal = normalize_calendar_identifier(
                    updates.get("caldav_default_cal")
                )
            if "caldav_selected_calendars" in updates and updates["caldav_selected_calendars"] is not None:
                calendars = normalize_calendar_selection(updates["caldav_selected_calendars"])
                self.caldav_selected_calendars = calendars
            if "expected_daily_hours" in updates:
                value = updates.get("expected_daily_hours")
                self.expected_daily_hours = float(value) if value not in (None, "") else None
            if "expected_weekly_hours" in updates:
                value = updates.get("expected_weekly_hours")
                self.expected_weekly_hours = float(value) if value not in (None, "") else None
            if "vacation_days_per_year" in updates and updates["vacation_days_per_year"] is not None:
                self.vacation_days_per_year = float(updates["vacation_days_per_year"])
            if "vacation_days_carryover" in updates and updates["vacation_days_carryover"] is not None:
                self.vacation_days_carryover = float(updates["vacation_days_carryover"])
            if "travel_sender_contact" in updates and updates["travel_sender_contact"] is not None:
                self.travel_sender_contact = _normalize_contact(updates["travel_sender_contact"])
            if "travel_hr_contact" in updates and updates["travel_hr_contact"] is not None:
                self.travel_hr_contact = _normalize_contact(updates["travel_hr_contact"])
            if "travel_letter_template" in updates and updates["travel_letter_template"] is not None:
                self.travel_letter_template = _normalize_template(updates["travel_letter_template"])
            if "day_overview_refresh_seconds" in updates and updates["day_overview_refresh_seconds"] is not None:
                self.day_overview_refresh_seconds = max(1, int(updates["day_overview_refresh_seconds"]))

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
            elif record.key == "caldav_selected_calendars":
                decoded["caldav_selected_calendars"] = json.loads(record.value)
            elif record.key == "expected_daily_hours":
                decoded["expected_daily_hours"] = float(record.value) if record.value else None
            elif record.key == "expected_weekly_hours":
                decoded["expected_weekly_hours"] = float(record.value) if record.value else None
            elif record.key == "vacation_days_per_year":
                decoded["vacation_days_per_year"] = float(record.value) if record.value else 0.0
            elif record.key == "vacation_days_carryover":
                decoded["vacation_days_carryover"] = float(record.value) if record.value else 0.0
            elif record.key == "travel_sender_contact":
                try:
                    decoded["travel_sender_contact"] = json.loads(record.value)
                except json.JSONDecodeError:
                    decoded["travel_sender_contact"] = {}
            elif record.key == "travel_hr_contact":
                try:
                    decoded["travel_hr_contact"] = json.loads(record.value)
                except json.JSONDecodeError:
                    decoded["travel_hr_contact"] = {}
            elif record.key == "travel_letter_template":
                try:
                    decoded["travel_letter_template"] = json.loads(record.value)
                except json.JSONDecodeError:
                    decoded["travel_letter_template"] = {}
            elif record.key == "day_overview_refresh_seconds":
                decoded["day_overview_refresh_seconds"] = int(record.value) if record.value else 1
        if decoded:
            self.apply(decoded)

    def persist(self, session: Session, updates: Dict[str, Any]) -> None:
        for key, value in updates.items():
            if value is None:
                value = ""
            if key == "block_ips":
                value = json.dumps([ip.strip() for ip in value if ip.strip()])
            if key == "caldav_selected_calendars":
                value = json.dumps(normalize_calendar_selection(value))
            if key == "caldav_default_cal":
                normalized = normalize_calendar_identifier(value)
                value = normalized or ""
            if key == "caldav_password" and value == "__UNCHANGED__":
                continue
            if key in {"expected_daily_hours", "expected_weekly_hours"}:
                value = "" if value in (None, "") else str(value)
            if key == "day_overview_refresh_seconds":
                value = str(max(1, int(value))) if value not in (None, "") else "1"
            if key in {"vacation_days_per_year", "vacation_days_carryover"}:
                value = str(value)
            if key in {"travel_sender_contact", "travel_hr_contact", "travel_letter_template"}:
                value = json.dumps(value)
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
