from __future__ import annotations

import datetime as dt
from typing import Any, Dict, List, Optional

from typing_extensions import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_serializer, model_validator


def _serialize_datetime(value: dt.datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.timezone.utc)
    else:
        value = value.astimezone(dt.timezone.utc)
    return value.isoformat()

class SessionNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    session_id: int
    note_type: str
    content: str
    created_at: dt.datetime

    @model_serializer(mode="plain", when_used="json")
    def _serialize(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "note_type": self.note_type,
            "content": self.content,
            "created_at": _serialize_datetime(self.created_at),
        }


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
    notes: List[SessionNoteResponse] = Field(default_factory=list)

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
            "notes": [note._serialize() for note in self.notes],
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


class SessionNoteCreateRequest(BaseModel):
    content: str
    note_type: str = Field(default="runtime")
    created_at: Optional[dt.datetime] = None


class WorkToggleResponse(BaseModel):
    session: WorkSessionBase
    action: str


class DaySummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    day: dt.date
    work_seconds: int
    pause_seconds: int
    overtime_seconds: int
    expected_seconds: int
    vacation_seconds: int
    sick_seconds: int
    is_weekend: bool
    is_holiday: bool
    holiday_name: Optional[str] = None
    leave_types: List[str]
    baseline_expected_seconds: Optional[int] = None


class LeaveEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    start_date: dt.date
    end_date: dt.date
    type: str
    comment: Optional[str]
    approved: bool
    day_count: float


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
    status: str
    ignored: bool
    attendees: list[str]

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
            "status": self.status,
            "ignored": self.ignored,
            "attendees": list(self.attendees or []),
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
    status: Optional[str] = None
    attendees: list[str] = []


class CalendarEventUpdateRequest(BaseModel):
    participated: Optional[bool] = None
    status: Optional[str] = None
    ignored: Optional[bool] = None


class SubtrackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    day: dt.date
    title: str
    start_time: Optional[dt.datetime]
    end_time: Optional[dt.datetime]
    status: str
    total_seconds: int
    paused_duration: int
    last_pause_start: Optional[dt.datetime]
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
            "status": self.status,
            "total_seconds": self.total_seconds,
            "paused_duration": self.paused_duration,
            "last_pause_start": _serialize_datetime(self.last_pause_start)
            if self.last_pause_start
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


class SubtrackUpdateRequest(BaseModel):
    day: Optional[dt.date] = None
    title: Optional[str] = None
    start_time: Optional[dt.datetime] = None
    end_time: Optional[dt.datetime] = None
    project: Optional[str] = None
    tags: Optional[List[str]] = None
    note: Optional[str] = None


class SubtrackActionRequest(BaseModel):
    timestamp: Optional[dt.datetime] = None


class TravelInvoiceReference(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    document_type: str
    original_name: str
    created_at: dt.datetime

    @model_serializer(mode="plain", when_used="json")
    def _serialize(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "document_type": self.document_type,
            "original_name": self.original_name,
            "created_at": _serialize_datetime(self.created_at),
        }


class TravelDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    trip_id: int
    document_type: str
    original_name: str
    comment: Optional[str]
    signed: bool
    collection_label: Optional[str] = None
    linked_invoice_id: Optional[int] = None
    linked_invoice: Optional[TravelInvoiceReference] = None
    sort_index: int
    created_at: dt.datetime

    @model_serializer(mode="plain", when_used="json")
    def _serialize(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "trip_id": self.trip_id,
            "document_type": self.document_type,
            "original_name": self.original_name,
            "comment": self.comment,
            "signed": self.signed,
            "collection_label": self.collection_label,
            "linked_invoice_id": self.linked_invoice_id,
            "linked_invoice": self.linked_invoice._serialize() if self.linked_invoice else None,
            "sort_index": self.sort_index,
            "created_at": _serialize_datetime(self.created_at),
            "download_path": f"/travels/{self.trip_id}/documents/{self.id}/download",
            "open_path": f"/travels/{self.trip_id}/documents/{self.id}/open",
        }


class TravelTripResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    start_date: dt.date
    end_date: dt.date
    destination: Optional[str]
    purpose: Optional[str]
    workflow_state: str
    notes: Optional[str]
    created_at: dt.datetime
    updated_at: dt.datetime
    documents: List[TravelDocumentResponse]

    @model_serializer(mode="plain", when_used="json")
    def _serialize(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "destination": self.destination,
            "purpose": self.purpose,
            "workflow_state": self.workflow_state,
            "notes": self.notes,
            "created_at": _serialize_datetime(self.created_at),
            "updated_at": _serialize_datetime(self.updated_at),
            "documents": [doc._serialize() for doc in self.documents],
            "dataset_path": f"/travels/{self.id}/reisekostenpaket",
            "dataset_print_path": f"/travels/{self.id}/reisekostenpaket/druck",
        }


class TravelTripCreateRequest(BaseModel):
    title: str
    start_date: dt.date
    end_date: dt.date
    destination: Optional[str] = None
    purpose: Optional[str] = None
    workflow_state: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _validate_range(self) -> "TravelTripCreateRequest":
        if self.end_date < self.start_date:
            raise ValueError("Enddatum darf nicht vor dem Startdatum liegen")
        return self


class TravelTripUpdateRequest(BaseModel):
    title: Optional[str] = None
    start_date: Optional[dt.date] = None
    end_date: Optional[dt.date] = None
    destination: Optional[str] = None
    purpose: Optional[str] = None
    workflow_state: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def _validate_range(self) -> "TravelTripUpdateRequest":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("Enddatum darf nicht vor dem Startdatum liegen")
        return self


class TravelDocumentUpdateRequest(BaseModel):
    comment: Optional[str] = None
    signed: Optional[bool] = None
    collection_label: Optional[str] = None
    linked_invoice_id: Optional[int] = None


class TravelDocumentReorderRequest(BaseModel):
    order: List[int]

    @model_validator(mode="after")
    def _validate_order(self) -> "TravelDocumentReorderRequest":
        unique_ids = set(self.order)
        if not self.order or len(unique_ids) != len(self.order):
            raise ValueError("Die Reihenfolge muss eindeutige Dokument-IDs enthalten")
        return self


class TravelContact(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    department: Optional[str] = None
    street: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class TravelLetterTemplate(BaseModel):
    subject: str
    body: str


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
    vacation_days_per_year: float
    vacation_days_carryover: float
    day_overview_refresh_seconds: int
    time_display_format: Literal["hh:mm", "decimal"]
    travel_sender_contact: TravelContact
    travel_hr_contact: TravelContact
    travel_letter_template: TravelLetterTemplate


class SettingsUpdateRequest(BaseModel):
    block_ips: Optional[List[str]] = None
    caldav_url: Optional[str] = None
    caldav_user: Optional[str] = None
    caldav_password: Optional[str] = None
    caldav_default_cal: Optional[str] = None
    caldav_selected_calendars: Optional[List[str]] = None
    expected_daily_hours: Optional[float] = Field(default=None, ge=0)
    expected_weekly_hours: Optional[float] = Field(default=None, ge=0)
    vacation_days_per_year: Optional[float] = Field(default=None, ge=0)
    vacation_days_carryover: Optional[float] = Field(default=None)
    day_overview_refresh_seconds: Optional[int] = Field(default=None, ge=1, le=3600)
    time_display_format: Optional[Literal["hh:mm", "decimal"]] = None
    travel_sender_contact: Optional[TravelContact] = None
    travel_hr_contact: Optional[TravelContact] = None
    travel_letter_template: Optional[TravelLetterTemplate] = None


class TravelLetterPreviewResponse(BaseModel):
    subject: str
    body: str
    context: Dict[str, str]
    sender_contact: TravelContact
    hr_contact: TravelContact


class TravelLetterCreateRequest(BaseModel):
    subject: str = Field(min_length=1)
    body: str = Field(min_length=1)


class HolidayResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    day: dt.date
    name: str
    source: str


class HolidayCreateRequest(BaseModel):
    day: dt.date
    name: str


class HolidayImportRequest(BaseModel):
    content: str
