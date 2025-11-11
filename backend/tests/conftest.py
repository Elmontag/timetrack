from __future__ import annotations

import datetime as dt
import tempfile
from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.database import get_db
from app.main import app
from app import models


@pytest.fixture(scope="session")
def temp_db_path() -> Generator[Path, None, None]:
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "test.db"
        yield path


@pytest.fixture(scope="session")
def engine(temp_db_path: Path):
    url = f"sqlite:///{temp_db_path}"
    engine = create_engine(url, connect_args={"check_same_thread": False}, future=True)
    models.Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture(scope="function")
def session(engine) -> Generator[Session, None, None]:
    connection = engine.connect()
    transaction = connection.begin()
    SessionTesting = sessionmaker(bind=connection, autoflush=False, autocommit=False, future=True)
    session = SessionTesting()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture(scope="function")
def client(session: Session) -> Generator[TestClient, None, None]:
    def override_get_db():
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def sample_day() -> dt.date:
    return dt.date(2024, 1, 1)
