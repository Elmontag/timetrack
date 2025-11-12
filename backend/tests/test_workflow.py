from __future__ import annotations

import datetime as dt
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import models, services


def test_start_pause_resume_stop_flow(client: TestClient):
    start_resp = client.post("/work/start", json={"project": "MVP", "tags": ["core"], "comment": "Kickoff"})
    assert start_resp.status_code == 201
    data_start = start_resp.json()
    session_id = data_start["id"]
    assert data_start["start_time"].endswith("+00:00")
    assert data_start["notes"] == []

    pause_resp = client.post("/work/pause")
    assert pause_resp.status_code == 200
    assert pause_resp.json()["action"] == "paused"

    resume_resp = client.post("/work/pause")
    assert resume_resp.status_code == 200
    assert resume_resp.json()["action"] == "resumed"

    stop_resp = client.post("/work/stop", json={"comment": "Done"})
    assert stop_resp.status_code == 200
    data = stop_resp.json()
    assert data["status"] == "stopped"
    assert data["total_seconds"] >= 0
    assert "notes" in data

    day = dt.date.fromisoformat(data["start_time"].split("T")[0])
    sessions_resp = client.get(f"/work/day/{day}")
    assert sessions_resp.status_code == 200
    sessions = sessions_resp.json()
    assert any(s["id"] == session_id for s in sessions)
    assert all("notes" in s for s in sessions)


def test_session_note_creation_flow(client: TestClient):
    start_resp = client.post("/work/start", json={})
    assert start_resp.status_code == 201
    session_id = start_resp.json()["id"]

    note_payload = {
        "content": "Planung besprochen",
        "note_type": "start",
        "created_at": "2024-01-01T08:15:00",
    }
    note_resp = client.post(f"/work/session/{session_id}/notes", json=note_payload)
    assert note_resp.status_code == 201
    note_data = note_resp.json()
    assert note_data["session_id"] == session_id
    assert note_data["note_type"] == "start"
    assert note_data["content"] == "Planung besprochen"
    assert note_data["created_at"].startswith("2024-01-01T07:15") or note_data["created_at"].startswith("2024-01-01T08:15")

    day = start_resp.json()["start_time"].split("T")[0]
    sessions_resp = client.get(f"/work/day/{day}")
    assert sessions_resp.status_code == 200
    session = sessions_resp.json()[0]
    assert session["notes"][0]["content"] == "Planung besprochen"
    assert session["comment"] == "Planung besprochen"

    stop_resp = client.post("/work/stop", json={})
    assert stop_resp.status_code == 200

    summary_resp = client.get("/days", params={"from_date": day, "to_date": day})
    assert summary_resp.status_code == 200
    summaries = summary_resp.json()
    assert len(summaries) == 1
    assert "work_seconds" in summaries[0]


def test_start_with_custom_start_time(client: TestClient):
    custom_start = "2024-06-02T07:45:00"
    start_resp = client.post("/work/start", json={"start_time": custom_start})
    assert start_resp.status_code == 201
    data = start_resp.json()
    returned = dt.datetime.fromisoformat(data["start_time"])
    berlin = ZoneInfo("Europe/Berlin")
    expected_local = dt.datetime.fromisoformat(custom_start).replace(tzinfo=berlin)
    assert returned.astimezone(berlin).replace(tzinfo=None) == expected_local.replace(tzinfo=None)

    stop_resp = client.post("/work/stop", json={})
    assert stop_resp.status_code == 200
    stopped = stop_resp.json()
    assert stopped["start_time"] == data["start_time"]


def test_leave_creation_and_filter(client: TestClient):
    payload = {
        "start_date": "2024-01-01",
        "end_date": "2024-01-05",
        "type": "vacation",
        "comment": "Winterurlaub",
        "approved": True,
    }
    resp = client.post("/leaves", json=payload)
    assert resp.status_code == 201
    leave_id = resp.json()["id"]

    list_resp = client.get("/leaves", params={"from_date": "2024-01-01", "to_date": "2024-01-31", "type": "vacation"})
    assert list_resp.status_code == 200
    leaves = list_resp.json()
    assert any(leave["id"] == leave_id for leave in leaves)


def test_export_pdf_and_xlsx(client: TestClient):
    client.post("/work/start", json={})
    client.post("/work/stop", json={})

    pdf_resp = client.post(
        "/exports",
        json={
            "type": "timesheet",
            "format": "pdf",
            "range_start": "2024-01-01",
            "range_end": "2024-12-31",
        },
    )
    assert pdf_resp.status_code == 201
    export_id = pdf_resp.json()["id"]
    download_resp = client.get(f"/exports/{export_id}")
    assert download_resp.status_code == 200
    assert download_resp.headers["content-type"].startswith("application/pdf")

    xlsx_resp = client.post(
        "/exports",
        json={
            "type": "timesheet",
            "format": "xlsx",
            "range_start": "2024-01-01",
            "range_end": "2024-12-31",
        },
    )
    assert xlsx_resp.status_code == 201
    xlsx_id = xlsx_resp.json()["id"]
    download_xlsx = client.get(f"/exports/{xlsx_id}")
    assert download_xlsx.status_code == 200
    assert download_xlsx.headers["content-type"].startswith("application/vnd.openxmlformats")


def test_token_flow(client: TestClient):
    token_resp = client.post("/tokens", json={"scope": "toggle", "ttl_minutes": 5})
    assert token_resp.status_code == 201
    data = token_resp.json()
    token_value = data["token"]

    action_resp = client.get(f"/a/{token_value}")
    assert action_resp.status_code == 200
    result = action_resp.json()
    assert result["message"]


def test_manual_session_entry(client: TestClient):
    payload = {
        "start_time": "2024-02-01T09:00:00",
        "end_time": "2024-02-01T11:30:00",
        "project": "Retro",
        "comment": "Nachtrag",
        "tags": ["review"],
    }
    response = client.post("/work/manual", json=payload)
    assert response.status_code == 201
    session = response.json()
    assert session["status"] == "stopped"
    assert session["total_seconds"] == 9000

    day_resp = client.get("/work/day/2024-02-01")
    assert day_resp.status_code == 200
    entries = day_resp.json()
    assert any(item["comment"] == "Nachtrag" for item in entries)


def test_session_edit_and_delete(client: TestClient):
    create_resp = client.post(
        "/work/manual",
        json={
            "start_time": "2024-06-01T09:00:00",
            "end_time": "2024-06-01T11:00:00",
            "project": "Initial",
            "comment": "Erster Eintrag",
            "tags": ["alpha"],
        },
    )
    assert create_resp.status_code == 201
    session_id = create_resp.json()["id"]

    update_resp = client.patch(
        f"/work/session/{session_id}",
        json={
            "start_time": "2024-06-01T08:00:00",
            "end_time": "2024-06-01T12:30:00",
            "comment": "Aktualisiert",
            "project": "Projekt X",
            "tags": ["beta", "delta"],
        },
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["comment"] == "Aktualisiert"
    assert updated["project"] == "Projekt X"
    assert updated["tags"] == ["beta", "delta"]
    assert updated["total_seconds"] == 16200

    summary_resp = client.get("/days", params={"from_date": "2024-06-01", "to_date": "2024-06-01"})
    assert summary_resp.status_code == 200
    summary = summary_resp.json()[0]
    assert summary["work_seconds"] == 16200

    delete_resp = client.delete(f"/work/session/{session_id}")
    assert delete_resp.status_code == 204

    day_summary = client.get("/days", params={"from_date": "2024-06-01", "to_date": "2024-06-01"}).json()[0]
    assert day_summary["work_seconds"] == 0

    day_sessions = client.get("/work/day/2024-06-01").json()
    assert all(item["id"] != session_id for item in day_sessions)


def test_subtrack_creation(client: TestClient):
    payload = {
        "day": "2024-04-01",
        "title": "Kundentermin",
        "start_time": "2024-04-01T09:00:00",
        "end_time": "2024-04-01T10:00:00",
        "project": "ACME",
        "tags": ["meeting", "kunde"],
        "note": "Vorbereitung Sprint",
    }
    create_resp = client.post("/work/subtracks", json=payload)
    assert create_resp.status_code == 201
    subtrack = create_resp.json()
    assert subtrack["title"] == "Kundentermin"

    list_resp = client.get("/work/subtracks/2024-04-01")
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert any(item["title"] == "Kundentermin" for item in items)

    sessions_resp = client.get("/work/day/2024-04-01")
    assert sessions_resp.status_code == 200
    sessions = sessions_resp.json()
    assert len(sessions) == 1
    assert sessions[0]["comment"].startswith("Automatisch aus Termin:")
    session_start = dt.datetime.fromisoformat(sessions[0]["start_time"])
    expected_start = dt.datetime.fromisoformat(payload["start_time"]).replace(tzinfo=ZoneInfo("Europe/Berlin")).astimezone(dt.timezone.utc)
    assert session_start == expected_start
    session_end = dt.datetime.fromisoformat(sessions[0]["stop_time"])
    expected_end = dt.datetime.fromisoformat(payload["end_time"]).replace(tzinfo=ZoneInfo("Europe/Berlin")).astimezone(dt.timezone.utc)
    assert session_end == expected_end


def test_subtrack_update_and_delete(client: TestClient):
    create_resp = client.post(
        "/work/subtracks",
        json={
            "day": "2024-04-02",
            "title": "Daily",
            "start_time": "2024-04-02T08:00:00",
            "end_time": "2024-04-02T09:00:00",
            "note": "Sync",
        },
    )
    assert create_resp.status_code == 201
    subtrack_id = create_resp.json()["id"]

    update_resp = client.patch(
        f"/work/subtracks/{subtrack_id}",
        json={
            "title": "Daily Updated",
            "start_time": "2024-04-02T09:30:00",
            "end_time": "2024-04-02T10:15:00",
            "note": "Neuer Fokus",
            "tags": ["team"],
        },
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["title"] == "Daily Updated"
    assert updated["tags"] == ["team"]

    sessions = client.get("/work/day/2024-04-02").json()
    assert len(sessions) == 1
    updated_session = sessions[0]
    assert updated_session["comment"].startswith("Automatisch aus Termin:")
    updated_start = dt.datetime.fromisoformat(updated_session["start_time"])
    expected_updated_start = (
        dt.datetime.fromisoformat("2024-04-02T09:30:00")
        .replace(tzinfo=ZoneInfo("Europe/Berlin"))
        .astimezone(dt.timezone.utc)
    )
    assert updated_start == expected_updated_start

    delete_resp = client.delete(f"/work/subtracks/{subtrack_id}")
    assert delete_resp.status_code == 204

    sessions_after_delete = client.get("/work/day/2024-04-02").json()
    assert sessions_after_delete == []


def test_calendar_event_participation(client: TestClient):
    create_resp = client.post(
        "/calendar/events",
        json={
            "title": "Projektmeeting",
            "start_time": "2024-03-01T10:00:00",
            "end_time": "2024-03-01T11:00:00",
            "location": "Raum A",
            "description": "Kickoff",
        },
    )
    assert create_resp.status_code == 201
    event_id = create_resp.json()["id"]

    patch_resp = client.patch(f"/calendar/events/{event_id}", json={"participated": True})
    assert patch_resp.status_code == 200
    assert patch_resp.json()["participated"] is True

    list_resp = client.get("/calendar/events", params={"from_date": "2024-03-01", "to_date": "2024-03-31"})
    assert list_resp.status_code == 200
    events = list_resp.json()
    assert any(event["id"] == event_id and event["participated"] for event in events)

    subtracks = client.get("/work/subtracks/2024-03-01").json()
    assert len(subtracks) == 1
    assert subtracks[0]["title"] == "Projektmeeting"

    sessions = client.get("/work/day/2024-03-01").json()
    assert len(sessions) == 1
    assert sessions[0]["comment"].startswith("Automatisch aus Termin:")


def test_calendar_events_trigger_caldav_sync(monkeypatch, client: TestClient):
    called: dict[str, tuple[Optional[str], Optional[str]]] = {}

    def fake_sync(db, state, start_date, end_date):
        called["params"] = (
            start_date.isoformat() if start_date else None,
            end_date.isoformat() if end_date else None,
        )

    monkeypatch.setattr(services, "sync_caldav_events", fake_sync)
    resp = client.get("/calendar/events")
    assert resp.status_code == 200
    assert "params" in called


def test_caldav_calendar_listing(monkeypatch, client: TestClient):
    monkeypatch.setattr(
        "app.main.fetch_caldav_calendars",
        lambda state: [{"id": "cal-1", "name": "Team"}, {"id": "cal-2", "name": "Privat"}],
    )
    resp = client.get("/caldav/calendars")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload[0]["id"] == "cal-1"
    assert payload[1]["name"] == "Privat"


def test_caldav_calendar_listing_coerces_url_objects(monkeypatch, client: TestClient):
    class DummyURL:
        def __init__(self, value: str) -> None:
            self.value = value

        def __str__(self) -> str:
            return self.value

    class DummyCalendar:
        def __init__(self, url: DummyURL) -> None:
            self.url = url
            self.name = None

    class DummyPrincipal:
        def calendars(self):
            return [DummyCalendar(DummyURL("https://example.com/caldav/personal/"))]

    class DummyClient:
        def principal(self):
            return DummyPrincipal()

    monkeypatch.setattr(services, "_build_caldav_client", lambda state, strict=True: DummyClient())
    monkeypatch.setattr(services, "dav", None)

    resp = client.get("/caldav/calendars")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload == [
        {"id": "https://example.com/caldav/personal", "name": "personal"},
    ]


def test_caldav_authorization_error_without_attribute(monkeypatch, client: TestClient):
    class DummyError(Exception):
        pass

    class DummyClient:
        def principal(self):
            raise DummyError()

    class DummyModule:
        pass

    monkeypatch.setattr(services, "_build_caldav_client", lambda state, strict=True: DummyClient())
    monkeypatch.setattr(services, "caldav_error", DummyModule())

    resp = client.get("/caldav/calendars")
    assert resp.status_code == 502
    assert resp.json()["detail"] == "CalDAV-Kalender konnten nicht geladen werden"


def test_settings_update(client: TestClient, session: Session):
    update_payload = {
        "block_ips": ["192.168.0.0/24"],
        "caldav_url": "https://cal.example.com",
        "caldav_user": "user",
        "caldav_default_cal": "Work",
        "caldav_selected_calendars": ["Work", "Private"],
        "expected_daily_hours": 7.5,
        "expected_weekly_hours": 37.5,
        "day_overview_refresh_seconds": 5,
    }
    resp = client.put("/settings", json=update_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "192.168.0.0/24" in data["block_ips"]
    assert data["caldav_url"] == "https://cal.example.com"
    assert set(data["caldav_selected_calendars"]) == {"Work", "Private"}
    assert data["expected_daily_hours"] == 7.5
    assert data["expected_weekly_hours"] == 37.5
    assert data["day_overview_refresh_seconds"] == 5

    stored = session.query(models.AppSetting).all()
    assert any(item.key == "caldav_url" for item in stored)
    assert any(item.key == "day_overview_refresh_seconds" for item in stored)


def test_expected_hours_impact_summary(client: TestClient):
    update_resp = client.put("/settings", json={"expected_daily_hours": 6})
    assert update_resp.status_code == 200

    payload = {
        "start_time": "2024-05-01T08:00:00",
        "end_time": "2024-05-01T12:00:00",
        "project": "Analyse",
        "tags": ["focus"],
    }
    create_resp = client.post("/work/manual", json=payload)
    assert create_resp.status_code == 201

    summary_resp = client.get("/days", params={"from_date": "2024-05-01", "to_date": "2024-05-01"})
    assert summary_resp.status_code == 200
    summary = summary_resp.json()[0]
    assert summary["work_seconds"] == 4 * 3600
    assert summary["overtime_seconds"] == -2 * 3600


def test_token_reuse_records_event(client: TestClient, session: Session):
    token_resp = client.post("/tokens", json={"scope": "start", "ttl_minutes": 10, "single_use": True})
    assert token_resp.status_code == 201
    token_value = token_resp.json()["token"]

    first_use = client.get(f"/a/{token_value}")
    assert first_use.status_code == 200

    second_use = client.get(f"/a/{token_value}")
    assert second_use.status_code == 404

    events = session.query(models.TokenEvent).all()
    assert any(event.outcome == "reused" for event in events)
