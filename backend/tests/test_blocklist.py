from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import settings
from app.middleware import BlockListMiddleware
from app.state import RuntimeState


def _build_app(block_ips: list[str]) -> FastAPI:
    runtime_state = RuntimeState(settings)
    runtime_state.apply({"block_ips": block_ips})

    app = FastAPI()
    app.state.runtime_state = runtime_state
    app.add_middleware(BlockListMiddleware)

    @app.get("/ping")
    def ping() -> dict[str, str]:
        return {"status": "ok"}

    return app


def test_blocked_ip_returns_forbidden(monkeypatch) -> None:
    app = _build_app(["192.0.2.0/24"])
    monkeypatch.setattr(settings, "behind_proxy", True)
    with TestClient(app) as client:
        response = client.get("/ping", headers={"X-Forwarded-For": "192.0.2.25"})
    assert response.status_code == 403
    assert response.json() == {"detail": "Access denied"}


def test_unlisted_ip_is_permitted(monkeypatch) -> None:
    app = _build_app(["198.51.100.0/24"])
    monkeypatch.setattr(settings, "behind_proxy", True)
    with TestClient(app) as client:
        response = client.get("/ping", headers={"X-Forwarded-For": "192.0.2.25"})
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_single_host_entry_is_supported(monkeypatch) -> None:
    app = _build_app(["192.0.2.40"])
    monkeypatch.setattr(settings, "behind_proxy", True)
    with TestClient(app) as client:
        response = client.get("/ping", headers={"X-Forwarded-For": "192.0.2.40"})
    assert response.status_code == 403
    assert response.json() == {"detail": "Access denied"}
