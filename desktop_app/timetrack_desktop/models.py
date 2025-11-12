"""Datamodelle für die Desktop-Anwendung."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional


@dataclass(slots=True)
class Subtrack:
    """Repräsentiert einen Subtrack (Unteraufgabe)."""

    identifier: str
    title: str
    is_active: bool = False
    note: str | None = None


@dataclass(slots=True)
class TrackingStatus:
    """Darstellung des aktuellen Trackingstatus."""

    is_tracking: bool
    started_at: Optional[datetime] = None
    project: Optional[str] = None
    comment: Optional[str] = None
    active_subtrack: Optional[str] = None


@dataclass(slots=True)
class ProtocolEntry:
    """Einzelner Protokolleintrag für einen Arbeitstag."""

    entry_id: str
    started_at: datetime
    ended_at: Optional[datetime]
    duration_minutes: int
    project: Optional[str] = None
    comment: Optional[str] = None
    tags: List[str] = field(default_factory=list)


@dataclass(slots=True)
class BusinessTrip:
    """Repräsentiert eine Dienstreise."""

    trip_id: str
    destination: str
    start_date: datetime
    end_date: datetime
    purpose: Optional[str] = None
    documents: List[str] = field(default_factory=list)


__all__ = ["Subtrack", "TrackingStatus", "ProtocolEntry", "BusinessTrip"]
