from __future__ import annotations

import datetime as dt
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_serializer


def _serialize_datetime(value: dt.datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.timezone.utc)
    else:
        value = value.astimezone(dt.timezone.utc)
    return value.isoformat()


class WorkSessionBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    start_time: dt.datetime
    stop_time: Optional[dt.datetime]
    status: str
    project: Optional[str]
    tags: List[str]
    comment: Optional[str]
    paused_duration: int
    total_seconds: Optional[int]
    last_pause_start: Optional[dt.datetime]

    @model_serializer(mode="plain", when_used="json")
    def _serialize(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "start_time": _serialize_datetime(self.start_time),
            "stop_time": _serialize_datetime(self.stop_time) if self.stop_time else None,
            "status": self.status,
            "project": self.project,
            "tags": self.tags,
            "comment": self.comment,
            "paused_duration": self.paused_duration,
            "total_seconds": self.total_seconds,
            "last_pause_start": _serialize_datetime(self.last_pause_start)
            if self.last_pause_start
            else None,
        }



class WorkSessionCreateRequest(BaseModel):
    start_time: Optional[dt.datetime] = None
    project: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    comment: Optional[str] = None


class WorkPauseRequest(BaseModel):
    comment: Optional[str] = None


class WorkStopRequest(BaseModel):
    comment: Optional[str] = None


class WorkSessionManualRequest(BaseModel):
    start_time: dt.datetime
    end_time: dt.datetime
    project: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    comment: Optional[str] = None


class WorkSessionUpdateRequest(BaseModel):
    start_time: Optional[dt.datetime] = None
    end_time: Optional[dt.datetime] = None
    project: Optional[str] = None
    tags: Optional[List[str]] = None
    comment: Optional[str] = None


class WorkToggleResponse(BaseModel):
    session: WorkSessionBase
    action: str


class DaySummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    day: dt.date
    work_seconds: int
    pause_seconds: int
    overtime_seconds: int


class LeaveEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    start_date: dt.date
    end_date: dt.date
    type: str
    comment: Optional[str]
    approved: bool


class LeaveCreateRequest(BaseModel):
    start_date: dt.date
    end_date: dt.date
    type: str
    comment: Optional[str] = None
    approved: bool = False


class ExportRequest(BaseModel):
    type: str
    format: str
    range_start: dt.date
    range_end: dt.date


class ExportResponse(BaseModel):
    id: int
    type: str
    format: str
    range_start: dt.date
    range_end: dt.date
    created_at: dt.datetime
    path: str

    model_config = ConfigDict(from_attributes=True)

    @model_serializer(mode="plain", when_used="json")
    def _serialize(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "format": self.format,
            "range_start": self.range_start,
            "range_end": self.range_end,
            "created_at": _serialize_datetime(self.created_at),
            "path": self.path,
        }


class ActionTokenCreateRequest(BaseModel):
    scope: str
    ttl_minutes: Optional[int] = Field(default=60, ge=1)
    single_use: bool = False
    max_uses: Optional[int] = Field(default=None, ge=1)
    ip_bind: Optional[str] = None


class ActionTokenResponse(BaseModel):
    id: int
    scope: str
    expires_at: Optional[dt.datetime]
    single_use: bool
    remaining_uses: Optional[int]
    created_at: dt.datetime

    model_config = ConfigDict(from_attributes=True)

    @model_serializer(mode="plain", when_used="json")
    def _serialize(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "scope": self.scope,
            "expires_at": _serialize_datetime(self.expires_at)
            if self.expires_at
            else None,
            "single_use": self.single_use,
            "remaining_uses": self.remaining_uses,
            "created_at": _serialize_datetime(self.created_at),
        }


class ActionTokenCreatedResponse(ActionTokenResponse):
    token: str

    @model_serializer(mode="plain", when_used="json")
    def _serialize_created(self) -> dict[str, Any]:
        data = ActionTokenResponse._serialize(self)
        data["token"] = self.token
        return data


class ActionTokenResult(BaseModel):
    action: str
    session: Optional[WorkSessionBase]
    message: str


class CalendarEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    start_time: dt.datetime
    end_time: dt.datetime
    location: Optional[str]
    description: Optional[str]
    participated: bool

    @model_serializer(mode="plain", when_used="json")
    def _serialize(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "start_time": _serialize_datetime(self.start_time),
            "end_time": _serialize_datetime(self.end_time),
            "location": self.location,
            "description": self.description,
            "participated": self.participated,
        }


class CalDAVCalendarResponse(BaseModel):
    id: str
    name: str


class CalendarEventCreateRequest(BaseModel):
    title: str
    start_time: dt.datetime
    end_time: dt.datetime
    location: Optional[str] = None
    description: Optional[str] = None
    participated: bool = False


class CalendarEventUpdateRequest(BaseModel):
    participated: bool


class SubtrackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    day: dt.date
    title: str
    start_time: Optional[dt.datetime]
    end_time: Optional[dt.datetime]
    project: Optional[str]
    tags: List[str]
    note: Optional[str]

    @model_serializer(mode="plain", when_used="json")
    def _serialize(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "day": self.day,
            "title": self.title,
            "start_time": _serialize_datetime(self.start_time)
            if self.start_time
            else None,
            "end_time": _serialize_datetime(self.end_time)
            if self.end_time
            else None,
            "project": self.project,
            "tags": self.tags,
            "note": self.note,
        }


class SubtrackCreateRequest(BaseModel):
    day: dt.date
    title: str
    start_time: Optional[dt.datetime] = None
    end_time: Optional[dt.datetime] = None
    project: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    note: Optional[str] = None


class SettingsResponse(BaseModel):
    environment: str
    timezone: str
    locale: str
    storage: str
    block_ips: List[str]
    caldav_url: Optional[str]
    caldav_user: Optional[str]
    caldav_default_cal: Optional[str]
    caldav_selected_calendars: List[str]
    caldav_password_set: bool
    expected_daily_hours: Optional[float]
    expected_weekly_hours: Optional[float]


class SettingsUpdateRequest(BaseModel):
    block_ips: Optional[List[str]] = None
    caldav_url: Optional[str] = None
    caldav_user: Optional[str] = None
    caldav_password: Optional[str] = None
    caldav_default_cal: Optional[str] = None
    caldav_selected_calendars: Optional[List[str]] = None
    expected_daily_hours: Optional[float] = Field(default=None, ge=0)
    expected_weekly_hours: Optional[float] = Field(default=None, ge=0)
