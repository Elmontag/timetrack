from app.services import _calendar_matches_selection


class DummyURL:
    def __init__(self, value: str) -> None:
        self._value = value

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self._value


class DummyName:
    def __init__(self, value: str) -> None:
        self._value = value

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self._value


def test_calendar_matches_selection_accepts_url_objects() -> None:
    selection = ["https://example.com/caldav/user/calendar/"]
    candidate = DummyURL("https://example.com/caldav/user/calendar/")
    assert _calendar_matches_selection(selection, candidate)


def test_calendar_matches_selection_handles_name_objects() -> None:
    selection = ["projekt"]
    candidate = DummyName("Projekt")
    assert _calendar_matches_selection(selection, candidate)


def test_calendar_matches_selection_rejects_non_matching_candidates() -> None:
    selection = ["https://example.com/caldav/user/calendar/"]
    candidate = DummyURL("https://example.com/caldav/user/other/")
    assert not _calendar_matches_selection(selection, candidate)
