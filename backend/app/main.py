from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .database import engine, get_db
from .middleware import AllowListMiddleware
from .schemas import (
    ActionTokenCreateRequest,
    ActionTokenCreatedResponse,
    ActionTokenResult,
    DaySummaryResponse,
    ExportRequest,
    ExportResponse,
    LeaveCreateRequest,
    LeaveEntryResponse,
    WorkSessionBase,
    WorkSessionCreateRequest,
    WorkStopRequest,
    WorkToggleResponse,
)
from .services import (
    create_leave,
    export_sessions,
    list_leaves,
    list_sessions_for_day,
    pause_or_resume_session,
    range_day_summaries,
    start_session,
    stop_session,
)
from .token_utils import consume_token, create_token, verify_token

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name)
app.add_middleware(AllowListMiddleware)
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
    session = start_session(db, payload.project, payload.tags, payload.comment)
    return session


@app.post("/work/pause", response_model=WorkToggleResponse)
def work_pause(db: Session = Depends(get_db)) -> WorkToggleResponse:
    session = pause_or_resume_session(db)
    action = getattr(session, "_last_action", "paused")
    return WorkToggleResponse(session=session, action=action)


@app.post("/work/stop", response_model=WorkSessionBase)
def work_stop(payload: WorkStopRequest, db: Session = Depends(get_db)) -> WorkSessionBase:
    session = stop_session(db, payload.comment)
    return session


@app.get("/work/day/{day}", response_model=list[WorkSessionBase])
def work_day(day: dt.date, db: Session = Depends(get_db)) -> list[WorkSessionBase]:
    return list_sessions_for_day(db, day)


@app.get("/days", response_model=list[DaySummaryResponse])
def day_range(from_date: dt.date, to_date: dt.date, db: Session = Depends(get_db)) -> list[DaySummaryResponse]:
    if to_date < from_date:
        raise HTTPException(status_code=400, detail="Invalid range")
    return range_day_summaries(db, from_date, to_date)


@app.post("/leaves", response_model=LeaveEntryResponse, status_code=status.HTTP_201_CREATED)
def create_leave_entry(payload: LeaveCreateRequest, db: Session = Depends(get_db)) -> LeaveEntryResponse:
    entry = create_leave(db, payload.start_date, payload.end_date, payload.type, payload.comment, payload.approved)
    return entry


@app.get("/leaves", response_model=list[LeaveEntryResponse])
def get_leaves(from_date: Optional[dt.date] = None, to_date: Optional[dt.date] = None, type: Optional[str] = None, db: Session = Depends(get_db)) -> list[LeaveEntryResponse]:
    return list_leaves(db, from_date, to_date, type)


@app.post("/exports", response_model=ExportResponse, status_code=status.HTTP_201_CREATED)
def create_export(payload: ExportRequest, db: Session = Depends(get_db)) -> ExportResponse:
    export = export_sessions(db, payload.type, payload.format, payload.range_start, payload.range_end)
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
        session = stop_session(db)
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


@app.get("/settings")
def read_settings() -> dict[str, str | int]:
    return {
        "environment": settings.environment,
        "timezone": settings.timezone,
        "locale": settings.locale,
        "storage": settings.storage_backend,
    }
