from __future__ import annotations

from typing import Any, Iterable, List, Optional


def normalize_calendar_identifier(value: Any) -> Optional[str]:
    """Return a canonical calendar identifier without URL wrappers or slashes."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    lowered = text.lower()
    if lowered.startswith("url(") and text.endswith(")"):
        inner = text[text.find("(") + 1 : -1].strip()
        if (inner.startswith("'") and inner.endswith("'")) or (
            inner.startswith('"') and inner.endswith('"')
        ):
            inner = inner[1:-1]
        text = inner.strip()
    text = text.rstrip("/")
    return text or None


def normalize_calendar_selection(values: Iterable[Any]) -> List[str]:
    seen: set[str] = set()
    normalized: List[str] = []
    for value in values:
        candidate = normalize_calendar_identifier(value)
        if not candidate or candidate in seen:
            continue
        normalized.append(candidate)
        seen.add(candidate)
    return normalized
