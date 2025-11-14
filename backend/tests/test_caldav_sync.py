import datetime as dt
from typing import Any

import pytest
from fastapi import HTTPException, status
from icalendar import Event

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
        recurrence_key: str = "recurrence_id",
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
            key = recurrence_key or "recurrence_id"
            self._data[key] = recurrence_id
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
        recurrence_id: str | None = None,
        recurrence_key: str = "recurrence_id",
    ):
        self.vevent = FakeVEvent(
            summary,
            start,
            end,
            uid=uid,
            attendees=attendees,
            recurrence_id=recurrence_id,
            recurrence_key=recurrence_key,
        )


class FakeOccurrence:
    def __init__(
        self,
        summary: str,
        start: dt.datetime,
        end: dt.datetime,
        *,
        uid: str | None = None,
        attendees: list[Any] | None = None,
        recurrence_id: str | None = None,
        recurrence_key: str = "recurrence_id",
    ):
        self.icalendar_component = FakeComponent(
            summary,
            start,
            end,
            uid=uid,
            attendees=attendees,
            recurrence_id=recurrence_id,
            recurrence_key=recurrence_key,
        )


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


class RecurringMasterOccurrence:
    def __init__(self, vevent: Event):
        class Wrapper:
            def __init__(self, event: Event):
                self.vevent = event

        self.icalendar_component = Wrapper(vevent)


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


def test_sync_updates_event_without_uid_when_summary_changes(monkeypatch, session):
    state = _prepare_state()
    calendar_id = state.caldav_selected_calendars[0]
    original_start = dt.datetime(2024, 1, 8, 12, tzinfo=dt.timezone.utc)
    existing = CalendarEvent(
        title="Lunch",
        start_time=original_start,
        end_time=original_start + dt.timedelta(hours=1),
        location=None,
        description=None,
        participated=False,
        calendar_identifier=calendar_id,
        external_id=None,
        recurrence_id=None,
        attendees=[],
    )
    session.add(existing)
    session.commit()

    class UpdatedCalendar:
        def __init__(self):
            self.url = calendar_id
            self.name = "Personal"

        def date_search(self, *args, **kwargs):
            return [
                FakeOccurrence(
                    "Team Lunch",
                    original_start,
                    original_start + dt.timedelta(hours=1),
                )
            ]

    calendar = UpdatedCalendar()
    client = FakeClient([calendar])
    monkeypatch.setattr(services, "_build_caldav_client", lambda state, strict=False: client)

    services.sync_caldav_events(
        session, state, original_start.date(), original_start.date()
    )

    stored_events = session.query(CalendarEvent).order_by(CalendarEvent.start_time).all()
    assert len(stored_events) == 1
    assert stored_events[0].id == existing.id
    assert stored_events[0].title == "Team Lunch"


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


def test_sync_expands_master_event_when_server_does_not_expand(monkeypatch, session):
    class NonExpandingCalendar:
        def __init__(self):
            self.url = "https://example.com/caldav/calendars/personal"
            self.name = "Personal"
            self.event = Event()
            start = dt.datetime(2024, 1, 1, 9, tzinfo=dt.timezone.utc)
            self.event.add("summary", "Daily Standup")
            self.event.add("dtstart", start)
            self.event.add("dtend", start + dt.timedelta(minutes=30))
            self.event.add("uid", "daily-standup")
            self.event.add("rrule", {"freq": ["daily"], "count": [5]})

        def date_search(self, *args, **kwargs):
            return [RecurringMasterOccurrence(self.event)]

    calendar = NonExpandingCalendar()
    client = FakeClient([calendar])
    monkeypatch.setattr(services, "_build_caldav_client", lambda state, strict=False: client)

    state = _prepare_state()

    services.sync_caldav_events(
        session, state, dt.date(2024, 1, 3), dt.date(2024, 1, 5)
    )

    stored_events = (
        session.query(CalendarEvent)
        .filter(CalendarEvent.external_id == "daily-standup")
        .order_by(CalendarEvent.start_time)
        .all()
    )

    assert len(stored_events) == 3
    expected_starts = [
        dt.datetime(2024, 1, 3, 9, tzinfo=dt.timezone.utc),
        dt.datetime(2024, 1, 4, 9, tzinfo=dt.timezone.utc),
        dt.datetime(2024, 1, 5, 9, tzinfo=dt.timezone.utc),
    ]
    assert [
        _naive_utc(event.start_time) for event in stored_events
    ] == [
        _naive_utc(start) for start in expected_starts
    ]
    recurrence_ids = {event.recurrence_id for event in stored_events}
    assert len(recurrence_ids) == 3
    assert all(rec_id for rec_id in recurrence_ids)


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


def test_sync_tracks_recurring_series_without_recurrence_ids(monkeypatch, session):
    class WrappedOccurrence:
        def __init__(self, component):
            self.icalendar_component = component

    class SequentialCalendar:
        def __init__(self):
            self.url = "https://example.com/caldav/calendars/personal"
            self.name = "Personal"
            self.events: list[Event] = []
            start = dt.datetime(2024, 1, 1, 9, tzinfo=dt.timezone.utc)
            for offset in range(3):
                event = Event()
                event.add("summary", "Daily Sync")
                event.add("dtstart", start + dt.timedelta(days=offset))
                event.add("dtend", start + dt.timedelta(days=offset, minutes=30))
                event.add("uid", "series-uid")
                event.add("rrule", {"freq": ["daily"]})
                self.events.append(event)

        def date_search(self, start, end, expand=True):
            results: list[WrappedOccurrence] = []
            for event in self.events:
                dtstart = event.get("dtstart").dt
                if start <= dtstart <= end:
                    results.append(WrappedOccurrence(event))
            return results

    calendar = SequentialCalendar()
    client = FakeClient([calendar])
    monkeypatch.setattr(services, "_build_caldav_client", lambda state, strict=False: client)
    monkeypatch.setattr(services, "_expand_vevent_occurrences", lambda vevent, start, end: [])

    state = _prepare_state()

    for day in range(1, 4):
        services.sync_caldav_events(
            session, state, dt.date(2024, 1, day), dt.date(2024, 1, day)
        )

    stored_events = (
        session.query(CalendarEvent)
        .filter(CalendarEvent.external_id == "series-uid")
        .order_by(CalendarEvent.start_time)
        .all()
    )

    assert len(stored_events) == 3
    expected_starts = [
        services._ensure_utc(dt.datetime(2024, 1, 1, 9, tzinfo=dt.timezone.utc)),
        services._ensure_utc(dt.datetime(2024, 1, 2, 9, tzinfo=dt.timezone.utc)),
        services._ensure_utc(dt.datetime(2024, 1, 3, 9, tzinfo=dt.timezone.utc)),
    ]
    assert [
        _naive_utc(event.start_time) for event in stored_events
    ] == [_naive_utc(start) for start in expected_starts]


def test_sync_reuses_existing_event_when_calendar_identifier_case_differs(
    monkeypatch, session
):
    lower_identifier = "https://example.com/caldav/calendars/personal"
    canonical_identifier = "https://example.com/caldav/calendars/Personal"
    original_start = services._ensure_utc(dt.datetime(2024, 1, 8, 9))
    existing = CalendarEvent(
        title="Case Meeting",
        start_time=original_start,
        end_time=original_start + dt.timedelta(hours=1),
        location=None,
        description=None,
        participated=False,
        calendar_identifier=lower_identifier,
        external_id="case-uid",
        recurrence_id=None,
        attendees=[],
    )
    session.add(existing)
    session.commit()

    class CaseCalendar:
        def __init__(self):
            self.url = canonical_identifier
            self.name = "Personal"

        def date_search(self, *args, **kwargs):
            new_start = dt.datetime(2024, 1, 8, 10)
            new_end = new_start + dt.timedelta(hours=1)
            return [FakeOccurrence("Case Meeting", new_start, new_end, uid="case-uid")]

    client = FakeClient([CaseCalendar()])
    monkeypatch.setattr(services, "_build_caldav_client", lambda state, strict=False: client)

    state = _prepare_state()
    state.apply({"caldav_selected_calendars": [canonical_identifier]})

    services.sync_caldav_events(
        session, state, dt.date(2024, 1, 8), dt.date(2024, 1, 8)
    )

    stored_events = session.query(CalendarEvent).order_by(CalendarEvent.start_time).all()
    assert len(stored_events) == 1
    assert stored_events[0].id == existing.id
    assert stored_events[0].calendar_identifier == canonical_identifier
    expected_start = _naive_utc(services._ensure_utc(dt.datetime(2024, 1, 8, 10)))
    assert _naive_utc(stored_events[0].start_time) == expected_start


def test_sync_reads_recurrence_id_with_dash(monkeypatch, session):
    class RecurrenceCalendar:
        def __init__(self):
            self.url = "https://example.com/caldav/calendars/personal"
            self.name = "Personal"

        def date_search(self, *args, **kwargs):
            start = dt.datetime(2024, 1, 9, 11, tzinfo=dt.timezone.utc)
            end = start + dt.timedelta(hours=1)
            return [
                FakeOccurrence(
                    "Review",
                    start,
                    end,
                    uid="series-rec",
                    recurrence_id="20240108T110000Z",
                    recurrence_key="RECURRENCE-ID",
                )
            ]

    client = FakeClient([RecurrenceCalendar()])
    monkeypatch.setattr(services, "_build_caldav_client", lambda state, strict=False: client)

    state = _prepare_state()

    services.sync_caldav_events(
        session, state, dt.date(2024, 1, 9), dt.date(2024, 1, 9)
    )

    stored_events = session.query(CalendarEvent).all()
    assert len(stored_events) == 1
    assert stored_events[0].external_id == "series-rec"
    assert stored_events[0].recurrence_id == "20240108T110000Z"


def test_reconcile_calendar_events_normalizes_and_deduplicates(session):
    canonical_identifier = "https://example.com/caldav/calendars/Personal"
    lower_identifier = canonical_identifier.lower()
    start = dt.datetime(2024, 2, 1, 9, tzinfo=dt.timezone.utc)
    duplicate_a = CalendarEvent(
        title="Planning",
        start_time=start,
        end_time=start + dt.timedelta(hours=1),
        location=None,
        description=None,
        participated=False,
        calendar_identifier=lower_identifier,
        external_id="series-dup",
        recurrence_id=None,
        attendees=[],
    )
    duplicate_b = CalendarEvent(
        title="Planning",
        start_time=start,
        end_time=start + dt.timedelta(hours=1),
        location=None,
        description=None,
        participated=False,
        calendar_identifier=canonical_identifier,
        external_id="series-dup",
        recurrence_id=None,
        attendees=[],
    )
    other_start = dt.datetime(2024, 2, 2, 9, tzinfo=dt.timezone.utc)
    other_event = CalendarEvent(
        title="Retro",
        start_time=other_start,
        end_time=other_start + dt.timedelta(hours=1),
        location=None,
        description=None,
        participated=False,
        calendar_identifier=lower_identifier,
        external_id="series-other",
        recurrence_id="20240201T090000",
        attendees=[],
    )

    session.add_all([duplicate_a, duplicate_b, other_event])
    session.commit()

    result = services.reconcile_calendar_events(session, [canonical_identifier])

    remaining = (
        session.query(CalendarEvent)
        .order_by(CalendarEvent.start_time)
        .all()
    )
    assert len(remaining) == 2
    assert {event.external_id for event in remaining} == {
        "series-dup",
        "series-other",
    }
    assert {event.calendar_identifier for event in remaining} == {canonical_identifier}

    normalized_other = services._normalize_recurrence_value("20240201T090000")
    stored_other = next(event for event in remaining if event.external_id == "series-other")
    assert stored_other.recurrence_id == normalized_other

    assert result["removed"] == 1
    assert result["updated"] == 2
