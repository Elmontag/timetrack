from __future__ import annotations

import datetime as dt
import mimetypes
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .database import db_session, engine, get_db
from .middleware import BlockListMiddleware
from .schemas import (
    ActionTokenCreateRequest,
    ActionTokenCreatedResponse,
    ActionTokenResult,
    CalendarEventCreateRequest,
    CalendarEventResponse,
    CalendarEventUpdateRequest,
    CalDAVCalendarResponse,
    DaySummaryResponse,
    ExportRequest,
    ExportResponse,
    HolidayCreateRequest,
    HolidayImportRequest,
    HolidayResponse,
    LeaveCreateRequest,
    LeaveEntryResponse,
    SessionNoteCreateRequest,
    SessionNoteResponse,
    SubtrackActionRequest,
    SubtrackCreateRequest,
    SubtrackUpdateRequest,
    SubtrackResponse,
    TravelDocumentResponse,
    TravelDocumentReorderRequest,
    TravelDocumentUpdateRequest,
    TravelLetterCreateRequest,
    TravelLetterPreviewResponse,
    TravelTripCreateRequest,
    TravelTripResponse,
    TravelTripUpdateRequest,
    WorkSessionBase,
    WorkSessionCreateRequest,
    WorkSessionManualRequest,
    WorkSessionUpdateRequest,
    WorkStopRequest,
    WorkToggleResponse,
    SettingsResponse,
    SettingsUpdateRequest,
)
from .services import (
    add_travel_document,
    build_travel_dataset_archive,
    build_travel_dataset_pdf,
    create_calendar_event,
    create_holiday,
    create_subtrack,
    create_leave,
    create_travel_letter_document,
    create_manual_session,
    add_session_note,
    create_travel_trip,
    delete_holiday,
    delete_session,
    delete_subtrack,
    delete_travel_document,
    delete_travel_trip,
    export_sessions,
    generate_travel_letter_preview,
    fetch_caldav_calendars,
    import_holidays_from_ics,
    list_calendar_events,
    list_holidays,
    list_leaves,
    list_sessions_for_day,
    list_subtracks,
    list_travel_trips,
    pause_or_resume_session,
    range_day_summaries,
    reorder_travel_documents,
    resolve_travel_document_path,
    set_calendar_participation,
    start_session,
    start_subtrack,
    stop_session,
    stop_subtrack,
    update_runtime_settings,
    update_session,
    pause_subtrack,
    update_subtrack,
    update_travel_document,
    update_travel_trip,
)
from .state import RuntimeState
from .token_utils import consume_token, create_token, verify_token



def _apply_sqlite_migrations() -> None:
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("travel_documents")}
    statements: list[str] = []
    needs_sort_index_backfill = False
    if "collection_label" not in columns:
        statements.append("ALTER TABLE travel_documents ADD COLUMN collection_label VARCHAR(120)")
    if "linked_invoice_id" not in columns:
        statements.append("ALTER TABLE travel_documents ADD COLUMN linked_invoice_id INTEGER")
        statements.append(
            "CREATE INDEX IF NOT EXISTS ix_travel_documents_linked_invoice_id ON travel_documents (linked_invoice_id)"
        )
    if "sort_index" not in columns:
        statements.append(
            "ALTER TABLE travel_documents ADD COLUMN sort_index INTEGER NOT NULL DEFAULT 0"
        )
        statements.append(
            "CREATE INDEX IF NOT EXISTS ix_travel_documents_trip_sort_index ON travel_documents (trip_id, sort_index)"
        )
        needs_sort_index_backfill = True
    if statements:
        with engine.begin() as connection:
            for statement in statements:
                connection.execute(text(statement))
        if needs_sort_index_backfill:
            with engine.begin() as connection:
                result = connection.execute(
                    text(
                        "SELECT id, trip_id FROM travel_documents ORDER BY trip_id, created_at, id"
                    )
                )
                current_trip_id: int | None = None
                position = 0
                for doc_id, trip_id in result:
                    if current_trip_id != trip_id:
                        current_trip_id = trip_id
                        position = 0
                    connection.execute(
                        text(
                            "UPDATE travel_documents SET sort_index = :position WHERE id = :document_id"
                        ),
                        {"position": position, "document_id": doc_id},
                    )
                    position += 1


models.Base.metadata.create_all(bind=engine)
_apply_sqlite_migrations()

runtime_state = RuntimeState(settings)
with db_session() as session:
    try:
        runtime_state.load_from_db(session)
    except Exception:
        pass

app = FastAPI(title=settings.app_name)
app.state.runtime_state = runtime_state
app.add_middleware(BlockListMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/work/start", response_model=WorkSessionBase, status_code=status.HTTP_201_CREATED)
def work_start(payload: WorkSessionCreateRequest, db: Session = Depends(get_db)) -> WorkSessionBase:
    session = start_session(db, payload.project, payload.tags, payload.comment, payload.start_time)
    return session


@app.post("/work/pause", response_model=WorkToggleResponse)
def work_pause(db: Session = Depends(get_db)) -> WorkToggleResponse:
    session = pause_or_resume_session(db)
    action = getattr(session, "_last_action", "paused")
    return WorkToggleResponse(session=session, action=action)


@app.post("/work/stop", response_model=WorkSessionBase)
def work_stop(payload: WorkStopRequest, request: Request, db: Session = Depends(get_db)) -> WorkSessionBase:
    state: RuntimeState = request.app.state.runtime_state
    session = stop_session(db, state, payload.comment)
    return session


@app.post(
    "/work/session/{session_id}/notes",
    response_model=SessionNoteResponse,
    status_code=status.HTTP_201_CREATED,
)
def work_add_session_note(
    session_id: int,
    payload: SessionNoteCreateRequest,
    db: Session = Depends(get_db),
) -> SessionNoteResponse:
    note = add_session_note(db, session_id, payload.content, payload.note_type, payload.created_at)
    return note


@app.post("/work/manual", response_model=WorkSessionBase, status_code=status.HTTP_201_CREATED)
def work_manual(
    payload: WorkSessionManualRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> WorkSessionBase:
    state: RuntimeState = request.app.state.runtime_state
    session = create_manual_session(
        db,
        state,
        payload.start_time,
        payload.end_time,
        payload.project,
        payload.tags,
        payload.comment,
    )
    return session


@app.get("/work/day/{day}", response_model=list[WorkSessionBase])
def work_day(day: dt.date, db: Session = Depends(get_db)) -> list[WorkSessionBase]:
    return list_sessions_for_day(db, day)


@app.get("/work/subtracks/{day}", response_model=list[SubtrackResponse])
def work_subtracks(day: dt.date, db: Session = Depends(get_db)) -> list[SubtrackResponse]:
    return list_subtracks(db, day)


@app.post("/work/subtracks", response_model=SubtrackResponse, status_code=status.HTTP_201_CREATED)
def create_work_subtrack(
    payload: SubtrackCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    ) -> SubtrackResponse:
    state: RuntimeState = request.app.state.runtime_state
    subtrack = create_subtrack(
        db,
        state,
        payload.day,
        payload.title,
        payload.start_time,
        payload.end_time,
        payload.project,
        payload.tags,
        payload.note,
    )
    return subtrack


@app.patch("/work/subtracks/{subtrack_id}", response_model=SubtrackResponse)
def update_work_subtrack(
    subtrack_id: int,
    payload: SubtrackUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> SubtrackResponse:
    state: RuntimeState = request.app.state.runtime_state
    changes = payload.model_dump(exclude_unset=True)
    subtrack = update_subtrack(db, state, subtrack_id, changes)
    return subtrack


@app.post("/work/subtracks/{subtrack_id}/start", response_model=SubtrackResponse)
def start_work_subtrack(
    subtrack_id: int,
    payload: SubtrackActionRequest | None = None,
    db: Session = Depends(get_db),
) -> SubtrackResponse:
    subtrack = start_subtrack(db, subtrack_id, payload.timestamp if payload else None)
    return subtrack


@app.post("/work/subtracks/{subtrack_id}/pause", response_model=SubtrackResponse)
def pause_work_subtrack(
    subtrack_id: int,
    payload: SubtrackActionRequest | None = None,
    db: Session = Depends(get_db),
) -> SubtrackResponse:
    subtrack = pause_subtrack(db, subtrack_id, payload.timestamp if payload else None)
    return subtrack


@app.post("/work/subtracks/{subtrack_id}/stop", response_model=SubtrackResponse)
def stop_work_subtrack(
    subtrack_id: int,
    payload: SubtrackActionRequest | None = None,
    db: Session = Depends(get_db),
) -> SubtrackResponse:
    subtrack = stop_subtrack(db, subtrack_id, payload.timestamp if payload else None)
    return subtrack


@app.delete("/work/subtracks/{subtrack_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work_subtrack(
    subtrack_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    state: RuntimeState = request.app.state.runtime_state
    delete_subtrack(db, state, subtrack_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.patch("/work/session/{session_id}", response_model=WorkSessionBase)
def work_update_session(
    session_id: int,
    payload: WorkSessionUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> WorkSessionBase:
    state: RuntimeState = request.app.state.runtime_state
    changes = payload.model_dump(exclude_unset=True)
    session = update_session(db, state, session_id, changes)
    return session


@app.delete("/work/session/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def work_delete_session(session_id: int, request: Request, db: Session = Depends(get_db)) -> Response:
    state: RuntimeState = request.app.state.runtime_state
    delete_session(db, state, session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/days", response_model=list[DaySummaryResponse])
def day_range(
    from_date: dt.date,
    to_date: dt.date,
    request: Request,
    db: Session = Depends(get_db),
) -> list[DaySummaryResponse]:
    if to_date < from_date:
        raise HTTPException(status_code=400, detail="Invalid range")
    state: RuntimeState = request.app.state.runtime_state
    return range_day_summaries(db, from_date, to_date, state)


@app.post("/leaves", response_model=LeaveEntryResponse, status_code=status.HTTP_201_CREATED)
def create_leave_entry(payload: LeaveCreateRequest, db: Session = Depends(get_db)) -> LeaveEntryResponse:
    entry = create_leave(db, payload.start_date, payload.end_date, payload.type, payload.comment, payload.approved)
    return entry


@app.get("/leaves", response_model=list[LeaveEntryResponse])
def get_leaves(from_date: Optional[dt.date] = None, to_date: Optional[dt.date] = None, type: Optional[str] = None, db: Session = Depends(get_db)) -> list[LeaveEntryResponse]:
    return list_leaves(db, from_date, to_date, type)


@app.get("/holidays", response_model=list[HolidayResponse])
def get_holidays(
    from_date: Optional[dt.date] = None,
    to_date: Optional[dt.date] = None,
    db: Session = Depends(get_db),
) -> list[HolidayResponse]:
    return list_holidays(db, from_date, to_date)


@app.post("/holidays", response_model=HolidayResponse, status_code=status.HTTP_201_CREATED)
def create_holiday_entry(payload: HolidayCreateRequest, db: Session = Depends(get_db)) -> HolidayResponse:
    return create_holiday(db, payload.day, payload.name)


@app.delete("/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_holiday(holiday_id: int, db: Session = Depends(get_db)) -> Response:
    delete_holiday(db, holiday_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/holidays/import", response_model=list[HolidayResponse])
def import_holiday_file(payload: HolidayImportRequest, db: Session = Depends(get_db)) -> list[HolidayResponse]:
    return import_holidays_from_ics(db, payload.content)


@app.get("/calendar/events", response_model=list[CalendarEventResponse])
def get_calendar_events(
    request: Request,
    from_date: Optional[dt.date] = None,
    to_date: Optional[dt.date] = None,
    db: Session = Depends(get_db),
) -> list[CalendarEventResponse]:
    state: RuntimeState = request.app.state.runtime_state
    return list_calendar_events(db, state, from_date, to_date)


@app.get("/caldav/calendars", response_model=list[CalDAVCalendarResponse])
def get_caldav_calendars(request: Request) -> list[CalDAVCalendarResponse]:
    state: RuntimeState = request.app.state.runtime_state
    calendars = fetch_caldav_calendars(state)
    return [CalDAVCalendarResponse(id=item["id"], name=item["name"]) for item in calendars]


@app.post("/calendar/events", response_model=CalendarEventResponse, status_code=status.HTTP_201_CREATED)
def create_calendar_event_entry(payload: CalendarEventCreateRequest, db: Session = Depends(get_db)) -> CalendarEventResponse:
    event = create_calendar_event(
        db,
        payload.title,
        payload.start_time,
        payload.end_time,
        payload.location,
        payload.description,
        payload.participated,
        payload.status,
        payload.attendees,
    )
    return event


@app.patch("/calendar/events/{event_id}", response_model=CalendarEventResponse)
def update_calendar_event(
    event_id: int,
    payload: CalendarEventUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> CalendarEventResponse:
    state: RuntimeState = request.app.state.runtime_state
    event = set_calendar_participation(
        db,
        state,
        event_id,
        participated=payload.participated,
        status_value=payload.status,
        ignored=payload.ignored,
    )
    return event


@app.get("/travels", response_model=list[TravelTripResponse])
def list_travels(db: Session = Depends(get_db)) -> list[TravelTripResponse]:
    return list_travel_trips(db)


@app.post("/travels", response_model=TravelTripResponse, status_code=status.HTTP_201_CREATED)
def create_travel(payload: TravelTripCreateRequest, db: Session = Depends(get_db)) -> TravelTripResponse:
    trip = create_travel_trip(
        db,
        payload.title,
        payload.start_date,
        payload.end_date,
        payload.destination,
        payload.purpose,
        payload.workflow_state,
        payload.notes,
    )
    return trip


@app.put("/travels/{trip_id}", response_model=TravelTripResponse)
def update_travel(
    trip_id: int,
    payload: TravelTripUpdateRequest,
    db: Session = Depends(get_db),
) -> TravelTripResponse:
    changes = payload.model_dump(exclude_unset=True)
    trip = update_travel_trip(db, trip_id, **changes)
    return trip


@app.delete("/travels/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_travel(trip_id: int, db: Session = Depends(get_db)) -> Response:
    delete_travel_trip(db, trip_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post(
    "/travels/{trip_id}/documents",
    response_model=TravelDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_travel_document(
    trip_id: int,
    document_type: str = Form(...),
    comment: Optional[str] = Form(None),
    collection_label: Optional[str] = Form(None),
    linked_invoice_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> TravelDocumentResponse:
    content = await file.read()
    normalized_comment = comment.strip() if comment and comment.strip() else None
    document = add_travel_document(
        db,
        trip_id,
        document_type,
        file.filename or "upload",
        content,
        normalized_comment,
        collection_label=collection_label,
        linked_invoice_id=linked_invoice_id,
    )
    return document


@app.patch(
    "/travels/{trip_id}/documents/{document_id}",
    response_model=TravelDocumentResponse,
)
def modify_travel_document(
    trip_id: int,
    document_id: int,
    payload: TravelDocumentUpdateRequest,
    db: Session = Depends(get_db),
) -> TravelDocumentResponse:
    updates = payload.model_dump(exclude_unset=True)
    document = update_travel_document(db, trip_id, document_id, **updates)
    return document


@app.post(
    "/travels/{trip_id}/documents/reorder",
    response_model=TravelTripResponse,
)
def reorder_trip_documents(
    trip_id: int,
    payload: TravelDocumentReorderRequest,
    db: Session = Depends(get_db),
) -> TravelTripResponse:
    trip = reorder_travel_documents(db, trip_id, payload.order)
    return trip


@app.delete("/travels/{trip_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_travel_document(trip_id: int, document_id: int, db: Session = Depends(get_db)) -> Response:
    delete_travel_document(db, trip_id, document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/travels/{trip_id}/documents/{document_id}/download")
def download_travel_document(
    trip_id: int,
    document_id: int,
    db: Session = Depends(get_db),
) -> Response:
    document, path = resolve_travel_document_path(db, trip_id, document_id)
    return FileResponse(path, filename=document.original_name)


@app.get("/travels/{trip_id}/documents/{document_id}/open")
def open_travel_document(
    trip_id: int,
    document_id: int,
    db: Session = Depends(get_db),
) -> Response:
    document, path = resolve_travel_document_path(db, trip_id, document_id)
    media_type, _ = mimetypes.guess_type(document.original_name)
    headers = {"Content-Disposition": f'inline; filename="{document.original_name}"'}
    return FileResponse(path, media_type=media_type or "application/octet-stream", headers=headers)


@app.get("/travels/{trip_id}/reisekostenpaket")
def download_travel_dataset(trip_id: int, db: Session = Depends(get_db)) -> Response:
    filename, content = build_travel_dataset_archive(db, trip_id)
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content, media_type="application/zip", headers=headers)


@app.get("/travels/{trip_id}/reisekostenpaket/druck")
def print_travel_dataset(trip_id: int, db: Session = Depends(get_db)) -> Response:
    filename, content = build_travel_dataset_pdf(db, trip_id)
    headers = {"Content-Disposition": f'inline; filename="{filename}"'}
    return Response(content, media_type="application/pdf", headers=headers)


@app.get("/travels/{trip_id}/anschreiben", response_model=TravelLetterPreviewResponse)
def preview_travel_letter(
    trip_id: int,
    request: Request,
    db: Session = Depends(get_db),
) -> TravelLetterPreviewResponse:
    state: RuntimeState = request.app.state.runtime_state
    preview = generate_travel_letter_preview(db, state, trip_id)
    return TravelLetterPreviewResponse(**preview)


@app.post(
    "/travels/{trip_id}/anschreiben",
    response_model=TravelDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_travel_letter(
    trip_id: int,
    payload: TravelLetterCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TravelDocumentResponse:
    state: RuntimeState = request.app.state.runtime_state
    document = create_travel_letter_document(db, state, trip_id, payload.subject, payload.body)
    return document


@app.post("/exports", response_model=ExportResponse, status_code=status.HTTP_201_CREATED)
def create_export(
    payload: ExportRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> ExportResponse:
    state: RuntimeState = request.app.state.runtime_state
    export = export_sessions(db, state, payload.type, payload.format, payload.range_start, payload.range_end)
    return export


@app.get("/exports/{export_id}")
def download_export(export_id: int, db: Session = Depends(get_db)) -> Response:
    export = db.query(models.ExportRecord).filter(models.ExportRecord.id == export_id).one_or_none()
    if not export:
        raise HTTPException(status_code=404, detail="Export not found")
    path = Path(export.path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Export file missing")
    media_type = "application/pdf" if export.format == "pdf" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    filename = path.name
    return FileResponse(path, media_type=media_type, filename=filename)


@app.post("/tokens", response_model=ActionTokenCreatedResponse, status_code=status.HTTP_201_CREATED)
def create_action_token(payload: ActionTokenCreateRequest, db: Session = Depends(get_db)) -> ActionTokenCreatedResponse:
    token, token_value = create_token(db, payload.scope, payload.ttl_minutes, payload.single_use, payload.max_uses, payload.ip_bind)
    return ActionTokenCreatedResponse(
        id=token.id,
        scope=token.scope,
        expires_at=token.expires_at,
        single_use=bool(token.single_use),
        remaining_uses=token.remaining_uses,
        created_at=token.created_at,
        token=token_value,
    )


@app.delete("/tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_token(token_id: int, db: Session = Depends(get_db)) -> Response:
    token = db.query(models.ActionToken).filter(models.ActionToken.id == token_id).one_or_none()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    db.delete(token)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/a/{token_value}", response_model=ActionTokenResult)
def execute_token(token_value: str, request: Request, db: Session = Depends(get_db)) -> ActionTokenResult:
    token = verify_token(db, token_value)
    if not token:
        raise HTTPException(status_code=404, detail="Token invalid")
    client_ip = request.client.host if request.client else None
    state: RuntimeState = request.app.state.runtime_state
    if token.ip_bind and client_ip != token.ip_bind:
        consume_token(db, token, client_ip, "denied", "IP mismatch")
        raise HTTPException(status_code=403, detail="Token IP mismatch")

    scope = token.scope
    message = ""
    session = None
    if scope == "start":
        session = start_session(db, None, [], None)
        message = "Session started"
    elif scope == "pause":
        session = pause_or_resume_session(db)
        message = f"Session {getattr(session, '_last_action', 'paused')}"
    elif scope == "stop":
        session = stop_session(db, state)
        message = "Session stopped"
    elif scope == "toggle":
        try:
            session = pause_or_resume_session(db)
            message = f"Session {getattr(session, '_last_action', 'paused')}"
        except HTTPException:
            session = start_session(db, None, [], None)
            message = "Session started"
    else:
        consume_token(db, token, client_ip, "failed", "Unsupported scope")
        raise HTTPException(status_code=400, detail="Unsupported token scope")

    consume_token(db, token, client_ip, "success", message)
    return ActionTokenResult(action=scope, session=session, message=message)


@app.get("/settings", response_model=SettingsResponse)
def read_settings(request: Request) -> SettingsResponse:
    state: RuntimeState = request.app.state.runtime_state
    snapshot = state.snapshot()
    return SettingsResponse(
        environment=settings.environment,
        timezone=settings.timezone,
        locale=settings.locale,
        storage=settings.storage_backend,
        block_ips=snapshot["block_ips"],
        caldav_url=snapshot["caldav_url"] or None,
        caldav_user=snapshot["caldav_user"] or None,
        caldav_default_cal=snapshot["caldav_default_cal"] or None,
        caldav_selected_calendars=snapshot["caldav_selected_calendars"],
        caldav_password_set=snapshot["caldav_password_set"],
        expected_daily_hours=snapshot["expected_daily_hours"],
        expected_weekly_hours=snapshot["expected_weekly_hours"],
        vacation_days_per_year=snapshot["vacation_days_per_year"],
        vacation_days_carryover=snapshot["vacation_days_carryover"],
        day_overview_refresh_seconds=snapshot["day_overview_refresh_seconds"],
        time_display_format=snapshot["time_display_format"],
        travel_sender_contact=snapshot["travel_sender_contact"],
        travel_hr_contact=snapshot["travel_hr_contact"],
        travel_letter_template=snapshot["travel_letter_template"],
    )


@app.put("/settings", response_model=SettingsResponse)
def write_settings(payload: SettingsUpdateRequest, request: Request, db: Session = Depends(get_db)) -> SettingsResponse:
    state: RuntimeState = request.app.state.runtime_state
    updates = payload.model_dump(exclude_unset=True)
    snapshot = update_runtime_settings(db, state, updates)
    return SettingsResponse(
        environment=settings.environment,
        timezone=settings.timezone,
        locale=settings.locale,
        storage=settings.storage_backend,
        block_ips=snapshot["block_ips"],
        caldav_url=snapshot["caldav_url"] or None,
        caldav_user=snapshot["caldav_user"] or None,
        caldav_default_cal=snapshot["caldav_default_cal"] or None,
        caldav_selected_calendars=snapshot["caldav_selected_calendars"],
        caldav_password_set=snapshot["caldav_password_set"],
        expected_daily_hours=snapshot["expected_daily_hours"],
        expected_weekly_hours=snapshot["expected_weekly_hours"],
        vacation_days_per_year=snapshot["vacation_days_per_year"],
        vacation_days_carryover=snapshot["vacation_days_carryover"],
        day_overview_refresh_seconds=snapshot["day_overview_refresh_seconds"],
        time_display_format=snapshot["time_display_format"],
        travel_sender_contact=snapshot["travel_sender_contact"],
        travel_hr_contact=snapshot["travel_hr_contact"],
        travel_letter_template=snapshot["travel_letter_template"],
    )
