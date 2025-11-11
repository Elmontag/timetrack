from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from .config import settings
from .models import CalendarEvent, DaySummary, ExportRecord, LeaveEntry, WorkSession, WorkSubtrack
from .state import RuntimeState


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


def start_session(db: Session, project: Optional[str], tags: List[str], comment: Optional[str]) -> WorkSession:
    active = get_active_session(db)
    if active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Active session already exists")
    session = WorkSession(
        start_time=_now(),
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


def compute_day_summary(db: Session, day: dt.date, state: RuntimeState) -> DaySummary:
    start, end = _day_bounds(day)
    totals = (
        db.query(
            func.sum(WorkSession.total_seconds).label("work_seconds"),
            func.sum(WorkSession.paused_duration).label("pause_seconds"),
        )
        .filter(
            and_(
                WorkSession.start_time >= start,
                WorkSession.start_time < end,
                WorkSession.status == "stopped",
            )
        )
        .one()
    )
    summary = (
        db.query(DaySummary).filter(DaySummary.day == day).one_or_none()
        or DaySummary(day=day)
    )
    summary.work_seconds = int(totals.work_seconds or 0)
    summary.pause_seconds = int(totals.pause_seconds or 0)
    expected_daily_seconds = _expected_daily_seconds(state)
    summary.overtime_seconds = summary.work_seconds - expected_daily_seconds
    summary.updated_at = _now()
    db.add(summary)
    db.commit()
    db.refresh(summary)
    return summary


def update_day_summary(db: Session, day: dt.date, state: RuntimeState) -> DaySummary:
    return compute_day_summary(db, day, state)


def range_day_summaries(db: Session, start_day: dt.date, end_day: dt.date, state: RuntimeState) -> List[DaySummary]:
    summaries: List[DaySummary] = []
    current = start_day
    while current <= end_day:
        summaries.append(compute_day_summary(db, current, state))
        current += dt.timedelta(days=1)
    return summaries


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
    start_date: Optional[dt.date],
    end_date: Optional[dt.date],
) -> List[CalendarEvent]:
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
