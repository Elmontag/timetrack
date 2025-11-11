from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class WorkSession(Base):
    __tablename__ = "work_sessions"

    id = Column(Integer, primary_key=True, index=True)
    start_time = Column(DateTime(), nullable=False, index=True)
    stop_time = Column(DateTime(), nullable=True, index=True)
    status = Column(String(20), nullable=False, default="active", index=True)
    project = Column(String(100), nullable=True)
    tags = Column(SQLiteJSON, nullable=False, default=list)
    comment = Column(Text, nullable=True)
    paused_duration = Column(Integer, nullable=False, default=0)  # seconds
    last_pause_start = Column(DateTime(), nullable=True)
    total_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime(), default=dt.datetime.utcnow, nullable=False)

    def mark_paused(self, now: dt.datetime) -> None:
        if self.status == "paused":
            return
        self.last_pause_start = now
        self.status = "paused"

    def mark_resumed(self, now: dt.datetime) -> None:
        if self.status != "paused":
            return
        if self.last_pause_start:
            pause_delta = now - self.last_pause_start
            self.paused_duration += int(pause_delta.total_seconds())
        self.last_pause_start = None
        self.status = "active"

    def mark_stopped(self, now: dt.datetime) -> None:
        if self.status == "stopped":
            return
        if self.status == "paused" and self.last_pause_start:
            pause_delta = now - self.last_pause_start
            self.paused_duration += int(pause_delta.total_seconds())
            self.last_pause_start = None
        self.stop_time = now
        duration = now - self.start_time
        effective = duration.total_seconds() - self.paused_duration
        self.total_seconds = max(int(effective), 0)
        self.status = "stopped"


class DaySummary(Base):
    __tablename__ = "day_summaries"

    id = Column(Integer, primary_key=True)
    day = Column(Date, nullable=False, unique=True)
    work_seconds = Column(Integer, nullable=False, default=0)
    pause_seconds = Column(Integer, nullable=False, default=0)
    overtime_seconds = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(), default=dt.datetime.utcnow, nullable=False)


class LeaveEntry(Base):
    __tablename__ = "leave_entries"

    id = Column(Integer, primary_key=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    type = Column(String(20), nullable=False)
    comment = Column(Text, nullable=True)
    approved = Column(Integer, nullable=False, default=0)
    attachment = Column(String(255), nullable=True)


class ExportRecord(Base):
    __tablename__ = "exports"

    id = Column(Integer, primary_key=True)
    type = Column(String(20), nullable=False)
    format = Column(String(10), nullable=False)
    range_start = Column(Date, nullable=False)
    range_end = Column(Date, nullable=False)
    path = Column(String(255), nullable=False)
    checksum = Column(String(128), nullable=False)
    created_at = Column(DateTime(), default=dt.datetime.utcnow, nullable=False)


class ActionToken(Base):
    __tablename__ = "action_tokens"

    id = Column(Integer, primary_key=True)
    token_hash = Column(String(128), nullable=False, unique=True)
    scope = Column(String(50), nullable=False)
    expires_at = Column(DateTime(), nullable=True)
    single_use = Column(Integer, nullable=False, default=0)
    remaining_uses = Column(Integer, nullable=True)
    ip_bind = Column(String(50), nullable=True)
    created_at = Column(DateTime(), default=dt.datetime.utcnow, nullable=False)
    last_used_at = Column(DateTime(), nullable=True)

    events = relationship("TokenEvent", back_populates="token", cascade="all, delete-orphan")


class TokenEvent(Base):
    __tablename__ = "token_events"

    id = Column(Integer, primary_key=True)
    token_id = Column(Integer, ForeignKey("action_tokens.id"), nullable=False)
    used_at = Column(DateTime(), default=dt.datetime.utcnow, nullable=False)
    source_ip = Column(String(50), nullable=True)
    outcome = Column(String(20), nullable=False)
    detail = Column(Text, nullable=True)

    token = relationship("ActionToken", back_populates="events")


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    start_time = Column(DateTime(), nullable=False)
    end_time = Column(DateTime(), nullable=False)
    location = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    participated = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(), default=dt.datetime.utcnow, nullable=False)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime(), default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)
