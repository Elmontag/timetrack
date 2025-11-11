from __future__ import annotations

import datetime as dt
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


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



class WorkSessionCreateRequest(BaseModel):
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

    class Config:
        orm_mode = True


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

    class Config:
        orm_mode = True


class ActionTokenCreatedResponse(ActionTokenResponse):
    token: str


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


class CalendarEventCreateRequest(BaseModel):
    title: str
    start_time: dt.datetime
    end_time: dt.datetime
    location: Optional[str] = None
    description: Optional[str] = None
    participated: bool = False


class CalendarEventUpdateRequest(BaseModel):
    participated: bool


class SettingsResponse(BaseModel):
    environment: str
    timezone: str
    locale: str
    storage: str
    allow_ips: List[str]
    caldav_url: Optional[str]
    caldav_user: Optional[str]
    caldav_default_cal: Optional[str]
    caldav_password_set: bool


class SettingsUpdateRequest(BaseModel):
    allow_ips: Optional[List[str]] = None
    caldav_url: Optional[str] = None
    caldav_user: Optional[str] = None
    caldav_password: Optional[str] = None
    caldav_default_cal: Optional[str] = None
