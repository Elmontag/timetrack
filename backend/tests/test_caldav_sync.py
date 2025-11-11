import datetime as dt

import pytest
from fastapi import HTTPException, status

from app import services
from app.config import settings
from app.state import RuntimeState


class FakeVEvent:
    def __init__(self, summary: str, start: dt.datetime, end: dt.datetime):
        self._data = {
            "summary": summary,
            "dtstart": start,
            "dtend": end,
            "location": None,
            "description": None,
        }
        self.name = "VEVENT"

    def get(self, key: str):  # pragma: no cover - defensive fallback
        return self._data.get(key)


class FakeComponent:
    def __init__(self, summary: str, start: dt.datetime, end: dt.datetime):
        self.vevent = FakeVEvent(summary, start, end)


class FakeOccurrence:
    def __init__(self, summary: str, start: dt.datetime, end: dt.datetime):
        self.icalendar_component = FakeComponent(summary, start, end)


class StandaloneVEvent:
    """Mimics the icalendar.Event returned directly by caldav."""

    def __init__(self, summary: str, start: dt.datetime, end: dt.datetime):
        self.name = "VEVENT"
        self._data = {
            "summary": summary,
            "dtstart": start,
            "dtend": end,
        }

    def get(self, key: str):
        return self._data.get(key)


class StandaloneOccurrence:
    def __init__(self, summary: str, start: dt.datetime, end: dt.datetime):
        self.icalendar_component = StandaloneVEvent(summary, start, end)


class FakePrincipal:
    def __init__(self, calendars):
        self._calendars = calendars

    def calendars(self):  # pragma: no cover - trivial wrapper
        return self._calendars


class FakeClient:
    def __init__(self, calendars):
        self._principal = FakePrincipal(calendars)

    def principal(self):  # pragma: no cover - trivial wrapper
        return self._principal


def _prepare_state() -> RuntimeState:
    state = RuntimeState(settings)
    state.apply(
        {
            "caldav_url": "https://example.com/caldav",
            "caldav_user": "user",
            "caldav_password": "secret",
            "caldav_selected_calendars": ["https://example.com/caldav/calendars/personal"],
        }
    )
    return state


def test_sync_falls_back_to_non_expanded_search(monkeypatch, session):
    class FallbackCalendar:
        def __init__(self):
            self.url = "https://example.com/caldav/calendars/personal"
            self.name = "Personal"
            self.calls = []

        def date_search(self, start, end, expand=True):
            self.calls.append((start, end, expand))
            if expand:
                raise RuntimeError("expand unsupported")
            event_start = dt.datetime(2024, 1, 1, 8, tzinfo=dt.timezone.utc)
            event_end = event_start + dt.timedelta(hours=1)
            return [FakeOccurrence("Morning Standup", event_start, event_end)]

    calendar = FallbackCalendar()
    client = FakeClient([calendar])
    monkeypatch.setattr(services, "_build_caldav_client", lambda state, strict=False: client)

    state = _prepare_state()
    events = services.list_calendar_events(session, state, dt.date(2024, 1, 1), dt.date(2024, 1, 1))

    assert len(events) == 1
    assert events[0].title == "Morning Standup"
    assert len(calendar.calls) == 2
    assert calendar.calls[0][2] is True
    assert calendar.calls[1][2] is False


def test_sync_accepts_direct_vevent_occurrence(monkeypatch, session):
    class DirectCalendar:
        def __init__(self):
            self.url = "https://example.com/caldav/calendars/personal"
            self.name = "Personal"

        def date_search(self, *args, **kwargs):
            event_start = dt.datetime(2024, 1, 2, 9, tzinfo=dt.timezone.utc)
            event_end = event_start + dt.timedelta(hours=2)
            return [StandaloneOccurrence("Planning", event_start, event_end)]

    calendar = DirectCalendar()
    client = FakeClient([calendar])
    monkeypatch.setattr(services, "_build_caldav_client", lambda state, strict=False: client)

    state = _prepare_state()
    events = services.list_calendar_events(session, state, dt.date(2024, 1, 2), dt.date(2024, 1, 2))

    assert len(events) == 1
    assert events[0].title == "Planning"


def test_sync_raises_http_error_when_all_attempts_fail(monkeypatch, session):
    class FailingCalendar:
        def __init__(self):
            self.url = "https://example.com/caldav/calendars/personal"
            self.name = "Personal"

        def date_search(self, *args, **kwargs):
            raise RuntimeError("broken calendar")

        def events(self):
            raise RuntimeError("still broken")

    calendar = FailingCalendar()
    client = FakeClient([calendar])
    monkeypatch.setattr(services, "_build_caldav_client", lambda state, strict=False: client)

    state = _prepare_state()

    with pytest.raises(HTTPException) as excinfo:
        services.list_calendar_events(session, state, dt.date(2024, 1, 1), dt.date(2024, 1, 1))

    assert excinfo.value.status_code == status.HTTP_502_BAD_GATEWAY
    assert "konnte nicht synchronisiert" in excinfo.value.detail
