import datetime as dt
from typing import Any

import pytest
from fastapi import HTTPException, status

from app import services
from app.config import settings
from app.models import CalendarEvent
from app.state import RuntimeState


def _naive_utc(value: dt.datetime) -> dt.datetime:
    if value.tzinfo is not None:
        return value.astimezone(dt.timezone.utc).replace(tzinfo=None)
    return value


class FakeAttendee:
    def __init__(self, value: str, cn: str | None = None):
        self._value = value
        self.params: dict[str, list[str]] = {}
        if cn:
            self.params["CN"] = [cn]

    def to_ical(self):  # pragma: no cover - simple conversion
        return self._value.encode()


class FakeVEvent:
    def __init__(
        self,
        summary: str,
        start: dt.datetime,
        end: dt.datetime,
        *,
        uid: str | None = None,
        attendees: list[Any] | None = None,
        recurrence_id: str | None = None,
    ):
        self._data = {
            "summary": summary,
            "dtstart": start,
            "dtend": end,
            "location": None,
            "description": None,
        }
        if uid:
            self._data["uid"] = uid
        if attendees:
            self._data["attendee"] = attendees
        if recurrence_id:
            self._data["recurrence_id"] = recurrence_id
        self.name = "VEVENT"

    def get(self, key: str):  # pragma: no cover - defensive fallback
        return self._data.get(key)


class FakeComponent:
    def __init__(
        self,
        summary: str,
        start: dt.datetime,
        end: dt.datetime,
        *,
        uid: str | None = None,
        attendees: list[Any] | None = None,
    ):
        self.vevent = FakeVEvent(summary, start, end, uid=uid, attendees=attendees)


class FakeOccurrence:
    def __init__(
        self,
        summary: str,
        start: dt.datetime,
        end: dt.datetime,
        *,
        uid: str | None = None,
        attendees: list[Any] | None = None,
    ):
        self.icalendar_component = FakeComponent(summary, start, end, uid=uid, attendees=attendees)


class StandaloneVEvent:
    """Mimics the icalendar.Event returned directly by caldav."""

    def __init__(
        self,
        summary: str,
        start: dt.datetime,
        end: dt.datetime,
        *,
        attendees: list[Any] | None = None,
    ):
        self.name = "VEVENT"
        self._data = {
            "summary": summary,
            "dtstart": start,
            "dtend": end,
        }
        if attendees:
            self._data["attendee"] = attendees

    def get(self, key: str):
        return self._data.get(key)


class StandaloneOccurrence:
    def __init__(
        self,
        summary: str,
        start: dt.datetime,
        end: dt.datetime,
        *,
        attendees: list[Any] | None = None,
    ):
        self.icalendar_component = StandaloneVEvent(summary, start, end, attendees=attendees)


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
            attendees = [
                FakeAttendee("mailto:john@example.com", cn="John Doe"),
                "mailto:jane@example.com",
            ]
            return [StandaloneOccurrence("Planning", event_start, event_end, attendees=attendees)]

    calendar = DirectCalendar()
    client = FakeClient([calendar])
    monkeypatch.setattr(services, "_build_caldav_client", lambda state, strict=False: client)

    state = _prepare_state()
    events = services.list_calendar_events(session, state, dt.date(2024, 1, 2), dt.date(2024, 1, 2))

    assert len(events) == 1
    assert events[0].title == "Planning"
    assert events[0].attendees == ["John Doe", "mailto:jane@example.com"]


def test_sync_updates_single_event_without_creating_duplicate(monkeypatch, session):
    original_local = dt.datetime(2024, 1, 5, 9)
    original_start = services._ensure_utc(original_local)
    calendar_id = "https://example.com/caldav/calendars/personal"
    existing = CalendarEvent(
        title="Weekly Sync",
        start_time=original_start,
        end_time=original_start + dt.timedelta(hours=1),
        location=None,
        description=None,
        participated=False,
        calendar_identifier=calendar_id,
        external_id="event-123",
        recurrence_id=None,
        attendees=[],
    )
    session.add(existing)
    session.commit()

    class UpdateCalendar:
        def __init__(self):
            self.url = calendar_id
            self.name = "Personal"

        def date_search(self, *args, **kwargs):
            new_start = dt.datetime(2024, 1, 5, 10)
            new_end = new_start + dt.timedelta(hours=1)
            return [FakeOccurrence("Weekly Sync", new_start, new_end, uid="event-123")]

    calendar = UpdateCalendar()
    client = FakeClient([calendar])
    monkeypatch.setattr(services, "_build_caldav_client", lambda state, strict=False: client)

    state = _prepare_state()
    services.sync_caldav_events(
        session, state, dt.date(2024, 1, 5), dt.date(2024, 1, 5)
    )

    stored_events = session.query(CalendarEvent).order_by(CalendarEvent.start_time).all()
    assert len(stored_events) == 1
    assert stored_events[0].id == existing.id
    expected_start = _naive_utc(services._ensure_utc(dt.datetime(2024, 1, 5, 10)))
    assert _naive_utc(stored_events[0].start_time) == expected_start


def test_sync_distinguishes_multiple_occurrences_without_recurrence_id(
    monkeypatch, session
):
    class MultiCalendar:
        def __init__(self):
            self.url = "https://example.com/caldav/calendars/personal"
            self.name = "Personal"

        def date_search(self, *args, **kwargs):
            first_start = dt.datetime(2024, 1, 6, 8)
            second_start = first_start + dt.timedelta(days=1)
            return [
                FakeOccurrence("Training", first_start, first_start + dt.timedelta(hours=2), uid="series-456"),
                FakeOccurrence("Training", second_start, second_start + dt.timedelta(hours=2), uid="series-456"),
            ]

    calendar = MultiCalendar()
    client = FakeClient([calendar])
    monkeypatch.setattr(services, "_build_caldav_client", lambda state, strict=False: client)

    state = _prepare_state()
    services.sync_caldav_events(
        session, state, dt.date(2024, 1, 6), dt.date(2024, 1, 7)
    )

    stored_events = (
        session.query(CalendarEvent)
        .order_by(CalendarEvent.start_time)
        .filter(CalendarEvent.external_id == "series-456")
        .all()
    )
    assert len(stored_events) == 2
    first_expected = _naive_utc(services._ensure_utc(dt.datetime(2024, 1, 6, 8)))
    second_expected = _naive_utc(services._ensure_utc(dt.datetime(2024, 1, 7, 8)))
    assert _naive_utc(stored_events[0].start_time) == first_expected
    assert _naive_utc(stored_events[1].start_time) == second_expected


def test_sync_preserves_recurring_instances_outside_current_window(monkeypatch, session):
    class WindowedCalendar:
        def __init__(self):
            self.url = "https://example.com/caldav/calendars/personal"
            self.name = "Personal"
            self._starts = [
                dt.datetime(2024, 1, 6, 8),
                dt.datetime(2024, 1, 7, 8),
            ]

        def date_search(self, start, end, expand=True):
            def _normalize(value: dt.datetime) -> dt.datetime:
                if value.tzinfo is None:
                    return value
                return value.astimezone(dt.timezone.utc).replace(tzinfo=None)

            start_naive = _normalize(start)
            end_naive = _normalize(end)
            occurrences: list[FakeOccurrence] = []
            for start_time in self._starts:
                if start_naive <= start_time <= end_naive:
                    occurrences.append(
                        FakeOccurrence(
                            "Training",
                            start_time,
                            start_time + dt.timedelta(hours=2),
                            uid="series-789",
                        )
                    )
            return occurrences

    calendar = WindowedCalendar()
    client = FakeClient([calendar])
    monkeypatch.setattr(services, "_build_caldav_client", lambda state, strict=False: client)

    state = _prepare_state()

    services.sync_caldav_events(
        session, state, dt.date(2024, 1, 6), dt.date(2024, 1, 7)
    )

    initial_events = (
        session.query(CalendarEvent)
        .filter(CalendarEvent.external_id == "series-789")
        .order_by(CalendarEvent.start_time)
        .all()
    )
    assert len(initial_events) == 2

    services.sync_caldav_events(
        session, state, dt.date(2024, 1, 6), dt.date(2024, 1, 6)
    )

    stored_events = (
        session.query(CalendarEvent)
        .filter(CalendarEvent.external_id == "series-789")
        .order_by(CalendarEvent.start_time)
        .all()
    )
    assert len(stored_events) == 2
    assert [
        _naive_utc(event.start_time) for event in stored_events
    ] == [
        _naive_utc(event.start_time) for event in initial_events
    ]


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


def test_sync_deduplicates_by_uid(monkeypatch, session):
    class DuplicateCalendar:
        def __init__(self):
            self.url = "https://example.com/caldav/calendars/personal"
            self.name = "Personal"
            self.calls = 0

        def date_search(self, *args, **kwargs):
            self.calls += 1
            start = dt.datetime(2024, 1, 3, 10, tzinfo=dt.timezone.utc)
            end = start + dt.timedelta(hours=1)
            occurrence = FakeOccurrence("Sync Meeting", start, end, uid="uid-123")
            duplicate = FakeOccurrence("Sync Meeting", start, end, uid="uid-123")
            return [occurrence, duplicate]

    calendar = DuplicateCalendar()
    client = FakeClient([calendar])
    monkeypatch.setattr(services, "_build_caldav_client", lambda state, strict=False: client)

    state = _prepare_state()

    events = services.list_calendar_events(
        session, state, dt.date(2024, 1, 3), dt.date(2024, 1, 3)
    )

    assert len(events) == 1
    assert events[0].title == "Sync Meeting"
    assert session.query(CalendarEvent).count() == 1

    events_again = services.list_calendar_events(
        session, state, dt.date(2024, 1, 3), dt.date(2024, 1, 3)
    )

    assert len(events_again) == 1
    assert session.query(CalendarEvent).count() == 1
