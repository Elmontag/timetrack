from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Iterable, List, Optional

from fastapi import HTTPException, status
from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from .config import settings
from .models import DaySummary, ExportRecord, LeaveEntry, WorkSession


def _now() -> dt.datetime:
    return dt.datetime.utcnow()


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


def stop_session(db: Session, comment: Optional[str] = None) -> WorkSession:
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
    update_day_summary(db, session.start_time.date())
    return session


def list_sessions_for_day(db: Session, day: dt.date) -> List[WorkSession]:
    start = dt.datetime.combine(day, dt.time.min)
    end = start + dt.timedelta(days=1)
    sessions = (
        db.query(WorkSession)
        .filter(and_(WorkSession.start_time >= start, WorkSession.start_time < end))
        .order_by(WorkSession.start_time.asc())
        .all()
    )
    return sessions


def compute_day_summary(db: Session, day: dt.date) -> DaySummary:
    start = dt.datetime.combine(day, dt.time.min)
    end = start + dt.timedelta(days=1)
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
    expected_daily_seconds = 8 * 3600
    summary.overtime_seconds = summary.work_seconds - expected_daily_seconds
    summary.updated_at = _now()
    db.add(summary)
    db.commit()
    db.refresh(summary)
    return summary


def update_day_summary(db: Session, day: dt.date) -> DaySummary:
    return compute_day_summary(db, day)


def range_day_summaries(db: Session, start_day: dt.date, end_day: dt.date) -> List[DaySummary]:
    summaries: List[DaySummary] = []
    current = start_day
    while current <= end_day:
        summaries.append(compute_day_summary(db, current))
        current += dt.timedelta(days=1)
    return summaries


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
        sessions = (
            db.query(WorkSession)
            .filter(
                and_(
                    WorkSession.start_time >= dt.datetime.combine(start_date, dt.time.min),
                    WorkSession.start_time <= dt.datetime.combine(end_date, dt.time.max),
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
