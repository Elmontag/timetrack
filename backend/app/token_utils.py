from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import os
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from .config import settings
from .models import ActionToken, TokenEvent


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _ensure_aware(value: Optional[dt.datetime]) -> Optional[dt.datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=dt.timezone.utc)
    return value.astimezone(dt.timezone.utc)


def generate_token_value() -> str:
    raw = os.urandom(32)
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def token_hash(token: str) -> str:
    digest = hmac.new(settings.token_secret.encode(), msg=token.encode(), digestmod=hashlib.sha256)
    return digest.hexdigest()


def create_token(
    db: Session,
    scope: str,
    ttl_minutes: Optional[int],
    single_use: bool,
    max_uses: Optional[int],
    ip_bind: Optional[str],
) -> Tuple[ActionToken, str]:
    token_value = generate_token_value()
    hashed = token_hash(token_value)
    expires_at = None
    if ttl_minutes:
        expires_at = _now() + dt.timedelta(minutes=ttl_minutes)
    token = ActionToken(
        token_hash=hashed,
        scope=scope,
        expires_at=expires_at,
        single_use=1 if single_use else 0,
        remaining_uses=1 if single_use else max_uses,
        ip_bind=ip_bind,
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    return token, token_value


def verify_token(db: Session, token_value: str) -> Optional[ActionToken]:
    hashed = token_hash(token_value)
    token = db.query(ActionToken).filter(ActionToken.token_hash == hashed).one_or_none()
    if not token:
        return None
    now = _now()
    expires_at = _ensure_aware(token.expires_at)
    if expires_at and expires_at < now:
        _record_event(db, token, "expired", "Token expired")
        db.commit()
        return None
    last_used = _ensure_aware(token.last_used_at)
    if token.single_use and last_used is not None:
        _record_event(db, token, "reused", "Single use token already consumed")
        db.commit()
        return None
    if token.remaining_uses is not None and token.remaining_uses <= 0:
        _record_event(db, token, "exhausted", "Token uses exhausted")
        db.commit()
        return None
    return token


def consume_token(db: Session, token: ActionToken, source_ip: Optional[str], outcome: str, detail: str = "") -> None:
    now = _now()
    token.last_used_at = now
    if token.single_use:
        token.remaining_uses = 0
    elif token.remaining_uses is not None:
        token.remaining_uses -= 1
    _record_event(db, token, outcome, detail, source_ip)
    db.add(token)
    db.commit()


def _record_event(db: Session, token: ActionToken, outcome: str, detail: str, source_ip: Optional[str] = None) -> None:
    event = TokenEvent(token=token, outcome=outcome, detail=detail, source_ip=source_ip)
    db.add(event)
    db.flush()
