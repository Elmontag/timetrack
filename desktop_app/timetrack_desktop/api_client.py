"""HTTP-Client für die TimeTrack API."""

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import urljoin

import requests

from .models import BusinessTrip, ProtocolEntry, Subtrack, TrackingStatus


class ApiError(RuntimeError):
    """Fehler beim Zugriff auf die API."""

    def __init__(self, message: str, *, response: Optional[requests.Response] = None) -> None:
        super().__init__(message)
        self.response = response


class ApiClient:
    """Kapselt HTTP-Aufrufe zur TimeTrack API."""

    def __init__(self, base_url: str, token: Optional[str] = None, timeout: int = 15) -> None:
        self.base_url = base_url.rstrip("/") + "/"
        self.token = token
        self.timeout = timeout

    # ------------------------------------------------------------------
    # Hilfsfunktionen
    # ------------------------------------------------------------------
    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _request(self, method: str, path: str, **kwargs):
        url = urljoin(self.base_url, path.lstrip("/"))
        kwargs.setdefault("timeout", self.timeout)
        headers = kwargs.setdefault("headers", {})
        headers.update(self._headers())
        try:
            response = requests.request(method, url, **kwargs)
        except requests.RequestException as exc:  # pragma: no cover - Netzwerkfehler
            raise ApiError(str(exc)) from exc

        if response.status_code >= 400:
            raise ApiError(f"API Fehler {response.status_code}: {response.text}", response=response)

        if response.headers.get("Content-Type", "").startswith("application/json"):
            return response.json()
        return response.content

    # ------------------------------------------------------------------
    # Tracking
    # ------------------------------------------------------------------
    def start_tracking(self, *, project: Optional[str] = None, comment: Optional[str] = None,
                       tags: Optional[Iterable[str]] = None, subtrack: Optional[str] = None) -> None:
        payload = {
            "project": project,
            "comment": comment,
            "tags": list(tags or []),
        }
        if subtrack:
            payload["subtrack"] = subtrack
        self._request("POST", "/work/start", json=payload)

    def pause_tracking(self, comment: Optional[str] = None) -> None:
        payload = {"comment": comment} if comment else None
        self._request("POST", "/work/pause", json=payload)

    def stop_tracking(self, comment: Optional[str] = None) -> None:
        payload = {"comment": comment} if comment else None
        self._request("POST", "/work/stop", json=payload)

    def get_tracking_status(self) -> TrackingStatus:
        data = self._request("GET", "/work/status") or {}
        return TrackingStatus(
            is_tracking=bool(data.get("is_tracking")),
            started_at=self._parse_datetime(data.get("started_at")),
            project=data.get("project"),
            comment=data.get("comment"),
            active_subtrack=data.get("active_subtrack"),
        )

    # ------------------------------------------------------------------
    # Subtracks
    # ------------------------------------------------------------------
    def list_subtracks(self) -> list[Subtrack]:
        data = self._request("GET", "/work/subtracks") or []
        return [
            Subtrack(
                identifier=item.get("id", item.get("identifier", "")),
                title=item.get("title", "Unbenannt"),
                is_active=bool(item.get("is_active", False)),
                note=item.get("note"),
            )
            for item in data
        ]

    def save_subtrack(self, subtrack: Subtrack) -> None:
        payload = {
            "title": subtrack.title,
            "is_active": subtrack.is_active,
            "note": subtrack.note,
        }
        self._request("PUT", f"/work/subtracks/{subtrack.identifier}", json=payload)

    def create_subtrack(self, title: str, note: Optional[str] = None) -> Subtrack:
        payload = {"title": title, "note": note}
        data = self._request("POST", "/work/subtracks", json=payload) or {}
        identifier = data.get("id") if isinstance(data, dict) else title
        return Subtrack(identifier=identifier or title, title=title, note=note)

    def toggle_subtrack(self, identifier: str) -> None:
        self._request("POST", f"/work/subtracks/{identifier}/toggle")

    # ------------------------------------------------------------------
    # Protokoll
    # ------------------------------------------------------------------
    def get_protocol_entries(self, day: date) -> list[ProtocolEntry]:
        data = self._request("GET", "/work/sessions", params={"date": day.isoformat()}) or []
        entries: list[ProtocolEntry] = []
        for item in data:
            entries.append(
                ProtocolEntry(
                    entry_id=str(item.get("id")),
                    started_at=self._parse_datetime(item.get("started_at")),
                    ended_at=self._parse_datetime(item.get("ended_at")),
                    duration_minutes=int(item.get("duration_minutes", 0)),
                    project=item.get("project"),
                    comment=item.get("comment"),
                    tags=list(item.get("tags", [])),
                )
            )
        return entries

    def update_protocol_entry(self, entry: ProtocolEntry) -> None:
        payload = {
            "started_at": entry.started_at.isoformat(),
            "ended_at": entry.ended_at.isoformat() if entry.ended_at else None,
            "comment": entry.comment,
            "project": entry.project,
            "tags": entry.tags,
        }
        self._request("PUT", f"/work/sessions/{entry.entry_id}", json=payload)

    # ------------------------------------------------------------------
    # Dienstreisen
    # ------------------------------------------------------------------
    def list_business_trips(self) -> list[BusinessTrip]:
        data = self._request("GET", "/business-trips") or []
        trips: list[BusinessTrip] = []
        for item in data:
            trips.append(
                BusinessTrip(
                    trip_id=str(item.get("id")),
                    destination=item.get("destination", ""),
                    start_date=self._parse_datetime(item.get("start_date")),
                    end_date=self._parse_datetime(item.get("end_date")),
                    purpose=item.get("purpose"),
                    documents=list(item.get("documents", [])),
                )
            )
        return trips

    def upload_business_trip_document(self, trip_id: str, file_path: Path) -> None:
        with file_path.open("rb") as file_handle:
            files = {"file": (file_path.name, file_handle)}
            self._request("POST", f"/business-trips/{trip_id}/documents", files=files)

    # ------------------------------------------------------------------
    # Hilfsfunktionen
    # ------------------------------------------------------------------
    @staticmethod
    def _parse_datetime(value: Optional[str]):
        if not value:
            return None
        try:
            return datetime.fromisoformat(value)
        except ValueError:  # pragma: no cover - defensive
            return None


__all__ = ["ApiClient", "ApiError"]
