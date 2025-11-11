from __future__ import annotations

import datetime as dt

from fastapi.testclient import TestClient


def test_start_pause_resume_stop_flow(client: TestClient):
    start_resp = client.post("/work/start", json={"project": "MVP", "tags": ["core"], "comment": "Kickoff"})
    assert start_resp.status_code == 201
    session_id = start_resp.json()["id"]

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

    day = dt.date.fromisoformat(data["start_time"].split("T")[0])
    sessions_resp = client.get(f"/work/day/{day}")
    assert sessions_resp.status_code == 200
    sessions = sessions_resp.json()
    assert any(s["id"] == session_id for s in sessions)

    summary_resp = client.get("/days", params={"from_date": day, "to_date": day})
    assert summary_resp.status_code == 200
    summaries = summary_resp.json()
    assert len(summaries) == 1
    assert "work_seconds" in summaries[0]


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
