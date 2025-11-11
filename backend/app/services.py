from __future__ import annotations

import datetime as dt
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from sqlalchemy import and_
from sqlalchemy.orm import Session

from .config import settings
from .models import CalendarEvent, DaySummary, ExportRecord, LeaveEntry, WorkSession, WorkSubtrack
from .state import RuntimeState

try:  # pragma: no cover - optional dependency
    from caldav import DAVClient
    from caldav.elements import dav
    from caldav.lib import error as caldav_error
except ImportError:  # pragma: no cover - caldav optional
    DAVClient = None  # type: ignore[assignment]
    dav = None  # type: ignore[assignment]
    caldav_error = None  # type: ignore[assignment]


UTC = dt.timezone.utc
LOCAL_TZ = ZoneInfo(settings.timezone)


def _now() -> dt.datetime:
    return dt.datetime.now(UTC)


def _ensure_utc(value: dt.datetime) -> dt.datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=LOCAL_TZ)
    return value.astimezone(UTC)


def _day_bounds(day: dt.date) -> Tuple[dt.datetime, dt.datetime]:
    start_local = dt.datetime.combine(day, dt.time.min, tzinfo=LOCAL_TZ)
    end_local = start_local + dt.timedelta(days=1)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def _build_caldav_client(state: RuntimeState, *, strict: bool = False):
    if DAVClient is None:
        if strict:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="CalDAV support is not installed",
            )
        return None
    if not (state.caldav_url and state.caldav_user and state.caldav_password):
        if strict:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CalDAV-Zugangsdaten sind unvollständig",
            )
        return None
    try:
        return DAVClient(
            url=state.caldav_url,
            username=state.caldav_user,
            password=state.caldav_password,
        )
    except Exception as exc:  # pragma: no cover - network errors
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="CalDAV-Client konnte nicht initialisiert werden",
        ) from exc


def _calendar_matches_selection(selection: Iterable[str], *candidates: Optional[str]) -> bool:
    normalized = {entry.strip().lower() for entry in selection if entry.strip()}
    if not normalized:
        return False
    for candidate in candidates:
        if candidate and candidate.strip().lower() in normalized:
            return True
    return False


def _coerce_ical_datetime(value: Any) -> Optional[dt.datetime]:
    if value is None:
        return None
    attr = getattr(value, "dt", value)
    if isinstance(attr, dt.datetime):
        if attr.tzinfo is None:
            return attr.replace(tzinfo=LOCAL_TZ)
        return attr
    if isinstance(attr, dt.date):
        return dt.datetime.combine(attr, dt.time.min, tzinfo=LOCAL_TZ)
    return None


def fetch_caldav_calendars(state: RuntimeState) -> List[Dict[str, str]]:
    client = _build_caldav_client(state, strict=True)
    try:
        principal = client.principal()
        calendars = principal.calendars()
    except Exception as exc:  # pragma: no cover - remote errors
        auth_error = getattr(caldav_error, "AuthorizationError", None)
        if auth_error and isinstance(exc, auth_error):  # type: ignore[arg-type]
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="CalDAV-Anmeldung fehlgeschlagen") from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="CalDAV-Kalender konnten nicht geladen werden") from exc

    results: List[Dict[str, str]] = []
    for calendar in calendars:
        calendar_id = getattr(calendar, "url", None)
        display_name: Optional[str] = None
        if dav is not None and hasattr(calendar, "get_properties"):
            try:
                props = calendar.get_properties([dav.DisplayName()])  # type: ignore[attr-defined]
                display_value = props.get(dav.DisplayName()) if props else None  # type: ignore[attr-defined]
                if display_value:
                    display_name = str(display_value)
            except Exception:  # pragma: no cover - best effort only
                display_name = None
        if not display_name:
            display_name = getattr(calendar, "name", None)
        if not display_name and calendar_id:
            display_name = calendar_id.rstrip("/").split("/")[-1]
        if not calendar_id:
            calendar_id = display_name
        if not calendar_id:
            continue
        results.append({"id": calendar_id, "name": display_name or calendar_id})
    return results


def sync_caldav_events(
    db: Session,
    state: RuntimeState,
    start_date: Optional[dt.date],
    end_date: Optional[dt.date],
) -> None:
    client = _build_caldav_client(state)
    selected = state.caldav_selected_calendars
    if client is None or not selected:
        return

    start_day = start_date or dt.date.today()
    end_day = end_date or start_day
    range_start, _ = _day_bounds(start_day)
    _, range_end = _day_bounds(end_day)

    try:
        principal = client.principal()
        calendars = principal.calendars()
    except Exception as exc:  # pragma: no cover - remote errors
        auth_error = getattr(caldav_error, "AuthorizationError", None)
        if auth_error and isinstance(exc, auth_error):  # type: ignore[arg-type]
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="CalDAV-Anmeldung fehlgeschlagen") from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="CalDAV-Synchronisation fehlgeschlagen") from exc

    existing = {
        (event.title, event.start_time, event.end_time): event
        for event in db.query(CalendarEvent)
        .filter(CalendarEvent.start_time >= range_start, CalendarEvent.start_time <= range_end)
        .all()
    }
    updated = False

    for calendar in calendars:
        calendar_id = getattr(calendar, "url", None)
        calendar_name = getattr(calendar, "name", None)
        if not _calendar_matches_selection(selected, calendar_id, calendar_name):
            continue
        try:
            occurrences = calendar.date_search(range_start, range_end, expand=True)
        except Exception:  # pragma: no cover - ignore calendar specific issues
            continue
        for occurrence in occurrences:
            component = getattr(occurrence, "icalendar_component", None)
            vevent = None
            if component is not None:
                if hasattr(component, "subcomponents"):
                    for sub in component.subcomponents:  # type: ignore[attr-defined]
                        if getattr(sub, "name", "").upper() == "VEVENT":
                            vevent = sub
                            break
                if vevent is None and hasattr(component, "vevent"):
                    vevent = component.vevent
            if vevent is None:
                continue
            summary = vevent.get("summary")
            dtstart = _coerce_ical_datetime(vevent.get("dtstart"))
            dtend = _coerce_ical_datetime(vevent.get("dtend"))
            if dtstart is None:
                continue
            start_utc = _ensure_utc(dtstart)
            if dtend is None:
                dtend = dtstart + dt.timedelta(hours=1)
            end_utc = _ensure_utc(dtend)
            key = (str(summary or ""), start_utc, end_utc)
            if key in existing:
                continue
            event = CalendarEvent(
                title=str(summary or "Unbenannter Termin"),
                start_time=start_utc,
                end_time=end_utc,
                location=vevent.get("location"),
                description=vevent.get("description"),
                participated=False,
            )
            db.add(event)
            existing[key] = event
            updated = True

    if updated:
        db.commit()

def _expected_daily_seconds(state: RuntimeState) -> int:
    if state.expected_daily_hours is not None:
        return int(state.expected_daily_hours * 3600)
    if state.expected_weekly_hours is not None:
        return int(state.expected_weekly_hours / 5 * 3600)
    return int(settings.expected_daily_hours * 3600)


def _from_db_datetime(value: Optional[dt.datetime]) -> Optional[dt.datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def get_active_session(db: Session) -> Optional[WorkSession]:
    return (
        db.query(WorkSession)
        .filter(WorkSession.status.in_(["active", "paused"]))
        .order_by(WorkSession.start_time.desc())
        .first()
    )


def start_session(
    db: Session,
    project: Optional[str],
    tags: List[str],
    comment: Optional[str],
    start_time: Optional[dt.datetime] = None,
) -> WorkSession:
    active = get_active_session(db)
    if active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Active session already exists")
    session = WorkSession(
        start_time=_ensure_utc(start_time) if start_time else _now(),
        project=project,
        tags=tags,
        comment=comment,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def pause_or_resume_session(db: Session) -> WorkSession:
    session = get_active_session(db)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active session")
    now = _now()
    if session.status == "paused":
        session.mark_resumed(now)
        action = "resumed"
    else:
        session.mark_paused(now)
        action = "paused"
    db.add(session)
    db.commit()
    db.refresh(session)
    session._last_action = action  # type: ignore[attr-defined]
    return session


def stop_session(db: Session, state: RuntimeState, comment: Optional[str] = None) -> WorkSession:
    session = get_active_session(db)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active session")
    now = _now()
    if comment:
        session.comment = comment
    session.mark_stopped(now)
    db.add(session)
    db.commit()
    db.refresh(session)
    start_local = _from_db_datetime(session.start_time).astimezone(LOCAL_TZ)
    update_day_summary(db, start_local.date(), state)
    return session


def create_manual_session(
    db: Session,
    state: RuntimeState,
    start_time: dt.datetime,
    end_time: dt.datetime,
    project: Optional[str],
    tags: List[str],
    comment: Optional[str],
) -> WorkSession:
    if end_time <= start_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End time must be after start time")
    start_time_utc = _ensure_utc(start_time)
    end_time_utc = _ensure_utc(end_time)
    duration = end_time_utc - start_time_utc
    total_seconds = int(duration.total_seconds())
    session = WorkSession(
        start_time=start_time_utc,
        stop_time=end_time_utc,
        status="stopped",
        project=project,
        tags=tags,
        comment=comment,
        paused_duration=0,
        total_seconds=total_seconds,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    update_day_summary(db, start_time_utc.astimezone(LOCAL_TZ).date(), state)
    return session


def list_sessions_for_day(db: Session, day: dt.date) -> List[WorkSession]:
    start, end = _day_bounds(day)
    sessions = (
        db.query(WorkSession)
        .filter(and_(WorkSession.start_time >= start, WorkSession.start_time < end))
        .order_by(WorkSession.start_time.asc())
        .all()
    )
    return sessions


def _aggregate_sessions(
    db: Session,
    start_day: dt.date,
    end_day: dt.date,
) -> Dict[dt.date, Dict[str, int]]:
    range_start, _ = _day_bounds(start_day)
    _, range_end = _day_bounds(end_day)
    sessions = (
        db.query(WorkSession)
        .filter(
            and_(
                WorkSession.start_time >= range_start,
                WorkSession.start_time < range_end,
                WorkSession.status == "stopped",
            )
        )
        .all()
    )
    totals: Dict[dt.date, Dict[str, int]] = defaultdict(lambda: {"work": 0, "pause": 0})
    for session in sessions:
        local_start = _from_db_datetime(session.start_time).astimezone(LOCAL_TZ)
        day = local_start.date()
        if day < start_day or day > end_day:
            continue
        total_seconds = session.total_seconds
        if total_seconds is None and session.stop_time:
            start_utc = _from_db_datetime(session.start_time)
            stop_utc = _from_db_datetime(session.stop_time)
            total_seconds = int((stop_utc - start_utc).total_seconds()) - (session.paused_duration or 0)
        totals[day]["work"] += max(total_seconds or 0, 0)
        totals[day]["pause"] += session.paused_duration or 0
    return totals


def update_day_summary(db: Session, day: dt.date, state: RuntimeState) -> DaySummary:
    totals = _aggregate_sessions(db, day, day)
    expected = _expected_daily_seconds(state)
    summary = db.query(DaySummary).filter(DaySummary.day == day).one_or_none() or DaySummary(day=day)
    day_totals = totals.get(day, {"work": 0, "pause": 0})
    summary.work_seconds = day_totals["work"]
    summary.pause_seconds = day_totals["pause"]
    summary.overtime_seconds = summary.work_seconds - expected
    summary.updated_at = _now()
    db.add(summary)
    db.commit()
    db.refresh(summary)
    return summary


def range_day_summaries(db: Session, start_day: dt.date, end_day: dt.date, state: RuntimeState) -> List[DaySummary]:
    totals = _aggregate_sessions(db, start_day, end_day)
    expected = _expected_daily_seconds(state)
    summaries: List[DaySummary] = []
    current = start_day
    now = _now()
    while current <= end_day:
        totals_for_day = totals.get(current, {"work": 0, "pause": 0})
        summary = DaySummary(
            day=current,
            work_seconds=totals_for_day["work"],
            pause_seconds=totals_for_day["pause"],
            overtime_seconds=totals_for_day["work"] - expected,
            updated_at=now,
        )
        summaries.append(summary)
        current += dt.timedelta(days=1)
    return summaries


def update_session(
    db: Session,
    state: RuntimeState,
    session_id: int,
    changes: Dict[str, Any],
) -> WorkSession:
    session = db.get(WorkSession, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.status != "stopped":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only stopped sessions can be edited")

    old_day = _from_db_datetime(session.start_time).astimezone(LOCAL_TZ).date()

    if "start_time" in changes and changes["start_time"] is not None:
        session.start_time = _ensure_utc(changes["start_time"])
    if "end_time" in changes and changes["end_time"] is not None:
        session.stop_time = _ensure_utc(changes["end_time"])
    if session.stop_time is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Stop time is required")
    if session.start_time >= session.stop_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start must be before end")

    if "comment" in changes:
        session.comment = changes["comment"]
    if "project" in changes:
        session.project = changes["project"]
    if "tags" in changes:
        session.tags = changes["tags"] or []

    start_utc = _from_db_datetime(session.start_time)
    stop_utc = _from_db_datetime(session.stop_time)
    duration = stop_utc - start_utc
    session.total_seconds = max(int(duration.total_seconds()) - (session.paused_duration or 0), 0)
    session.last_pause_start = None
    session.status = "stopped"

    new_day = _from_db_datetime(session.start_time).astimezone(LOCAL_TZ).date()

    db.add(session)
    db.commit()
    db.refresh(session)

    affected_days = {old_day, new_day}
    for day in affected_days:
        update_day_summary(db, day, state)

    return session


def delete_session(db: Session, state: RuntimeState, session_id: int) -> None:
    session = db.get(WorkSession, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.status != "stopped":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Active sessions cannot be deleted")

    day = _from_db_datetime(session.start_time).astimezone(LOCAL_TZ).date()
    db.delete(session)
    db.commit()
    update_day_summary(db, day, state)


def create_subtrack(
    db: Session,
    state: RuntimeState,
    day: dt.date,
    title: str,
    start_time: Optional[dt.datetime],
    end_time: Optional[dt.datetime],
    project: Optional[str],
    tags: List[str],
    note: Optional[str],
) -> WorkSubtrack:
    start_time_utc = _ensure_utc(start_time) if start_time else None
    end_time_utc = _ensure_utc(end_time) if end_time else None
    if start_time_utc and end_time_utc and end_time_utc <= start_time_utc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Subtrack end must be after start")
    subtrack = WorkSubtrack(
        day=day,
        title=title,
        start_time=start_time_utc,
        end_time=end_time_utc,
        project=project,
        tags=tags,
        note=note,
    )
    db.add(subtrack)
    db.commit()
    db.refresh(subtrack)
    update_day_summary(db, day, state)
    return subtrack


def list_subtracks(db: Session, day: dt.date) -> List[WorkSubtrack]:
    return (
        db.query(WorkSubtrack)
        .filter(WorkSubtrack.day == day)
        .order_by(WorkSubtrack.start_time.asc(), WorkSubtrack.created_at.asc())
        .all()
    )


def create_leave(db: Session, start_date: dt.date, end_date: dt.date, leave_type: str, comment: Optional[str], approved: bool) -> LeaveEntry:
    if end_date < start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End date must be after start date")
    entry = LeaveEntry(
        start_date=start_date,
        end_date=end_date,
        type=leave_type,
        comment=comment,
        approved=1 if approved else 0,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_leaves(db: Session, start_date: Optional[dt.date], end_date: Optional[dt.date], leave_type: Optional[str]) -> List[LeaveEntry]:
    query = db.query(LeaveEntry)
    if start_date:
        query = query.filter(LeaveEntry.start_date >= start_date)
    if end_date:
        query = query.filter(LeaveEntry.end_date <= end_date)
    if leave_type:
        query = query.filter(LeaveEntry.type == leave_type)
    return query.order_by(LeaveEntry.start_date.asc()).all()


def create_calendar_event(
    db: Session,
    title: str,
    start_time: dt.datetime,
    end_time: dt.datetime,
    location: Optional[str],
    description: Optional[str],
    participated: bool,
) -> CalendarEvent:
    start_time_utc = _ensure_utc(start_time)
    end_time_utc = _ensure_utc(end_time)
    if end_time_utc <= start_time_utc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Event end must be after start")
    event = CalendarEvent(
        title=title,
        start_time=start_time_utc,
        end_time=end_time_utc,
        location=location,
        description=description,
        participated=participated,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def list_calendar_events(
    db: Session,
    state: RuntimeState,
    start_date: Optional[dt.date],
    end_date: Optional[dt.date],
) -> List[CalendarEvent]:
    sync_caldav_events(db, state, start_date, end_date)
    query = db.query(CalendarEvent)
    if start_date:
        start, _ = _day_bounds(start_date)
        query = query.filter(CalendarEvent.start_time >= start)
    if end_date:
        _, end = _day_bounds(end_date)
        query = query.filter(CalendarEvent.start_time <= end)
    return query.order_by(CalendarEvent.start_time.asc()).all()


def set_calendar_participation(db: Session, event_id: int, participated: bool) -> CalendarEvent:
    event = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar event not found")
    event.participated = participated
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def update_runtime_settings(db: Session, state: RuntimeState, updates: dict) -> dict:
    normalized = dict(updates)
    if "block_ips" in normalized and normalized["block_ips"] is not None:
        if isinstance(normalized["block_ips"], str):
            normalized["block_ips"] = [ip.strip() for ip in normalized["block_ips"].split(",") if ip.strip()]
    if "caldav_selected_calendars" in normalized and normalized["caldav_selected_calendars"] is not None:
        if isinstance(normalized["caldav_selected_calendars"], str):
            normalized["caldav_selected_calendars"] = [
                entry.strip()
                for entry in normalized["caldav_selected_calendars"].split(",")
                if entry.strip()
            ]
    state.apply(normalized)
    state.persist(
        db,
        {
            k: normalized[k]
            for k in normalized
            if k
            in {
                "block_ips",
                "caldav_url",
                "caldav_user",
                "caldav_password",
                "caldav_default_cal",
                "caldav_selected_calendars",
                "expected_daily_hours",
                "expected_weekly_hours",
            }
        },
    )
    return state.snapshot()


def _write_pdf(path: Path, title: str, sessions: Iterable[WorkSession]) -> None:
    pdf = canvas.Canvas(str(path), pagesize=A4)
    width, height = A4
    y = height - 2 * cm
    pdf.setTitle(title)
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(2 * cm, y, title)
    y -= 1 * cm
    pdf.setFont("Helvetica", 11)
    for session in sessions:
        line = f"{session.start_time.isoformat()} - {session.stop_time.isoformat() if session.stop_time else 'laufend'} | {(session.total_seconds or 0)/3600:.2f}h"
        pdf.drawString(2 * cm, y, line)
        y -= 0.8 * cm
        if y < 2 * cm:
            pdf.showPage()
            y = height - 2 * cm
            pdf.setFont("Helvetica", 11)
    pdf.save()


def _write_xlsx(path: Path, sessions: Iterable[WorkSession]) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Sessions"
    ws.append(["Start", "Stop", "Dauer (h)", "Projekt", "Notiz"])
    for session in sessions:
        duration_hours = (session.total_seconds or 0) / 3600
        ws.append(
            [
                session.start_time.isoformat(),
                session.stop_time.isoformat() if session.stop_time else "",
                round(duration_hours, 2),
                session.project or "",
                session.comment or "",
            ]
        )
    wb.save(path)


def export_sessions(db: Session, export_type: str, export_format: str, start_date: dt.date, end_date: dt.date) -> ExportRecord:
    if export_type not in {"timesheet", "leave"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported export type")
    if export_format not in {"pdf", "xlsx"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported export format")

    if export_type == "timesheet":
        start, _ = _day_bounds(start_date)
        _, end = _day_bounds(end_date)
        sessions = (
            db.query(WorkSession)
            .filter(
                and_(
                    WorkSession.start_time >= start,
                    WorkSession.start_time <= end,
                    WorkSession.status == "stopped",
                )
            )
            .order_by(WorkSession.start_time.asc())
            .all()
        )
    else:  # leave export
        leaves = list_leaves(db, start_date, end_date, None)
        sessions = []
        for leave in leaves:
            session = WorkSession(
                start_time=dt.datetime.combine(leave.start_date, dt.time.min),
                stop_time=dt.datetime.combine(leave.end_date, dt.time.max),
                total_seconds=((leave.end_date - leave.start_date).days + 1) * 8 * 3600,
                project=leave.type,
                comment=leave.comment,
                status="stopped",
                tags=["leave"],
            )
            sessions.append(session)

    file_suffix = "pdf" if export_format == "pdf" else "xlsx"
    filename = f"export_{export_type}_{start_date}_{end_date}_{int(_now().timestamp())}.{file_suffix}"
    path = settings.export_dir / filename

    if export_format == "pdf":
        _write_pdf(path, f"TimeTrack Export - {export_type}", sessions)
    else:
        _write_xlsx(path, sessions)

    checksum = _checksum_file(path)
    export = ExportRecord(
        type=export_type,
        format=export_format,
        range_start=start_date,
        range_end=end_date,
        path=str(path),
        checksum=checksum,
    )
    db.add(export)
    db.commit()
    db.refresh(export)
    return export


def _checksum_file(path: Path) -> str:
    import hashlib

    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()
