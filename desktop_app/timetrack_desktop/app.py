"""Einstiegspunkt für die Desktop-Anwendung."""

from __future__ import annotations

import sys

from PySide6.QtWidgets import QApplication, QMessageBox

from .api_client import ApiClient, ApiError
from .config import load_config
from .widgets.status import StatusDashboard
from .widgets.tray import create_tray_icon


def main() -> None:
    """Startet die Qt-Anwendung."""

    app = QApplication(sys.argv)
    app.setApplicationName("TimeTrack Desktop")
    app.setOrganizationName("TimeTrack")
    config = load_config()

    api_client = ApiClient(config.api_base_url, token=config.api_token)

    window = StatusDashboard(
        api_client=api_client,
        web_app_url=config.web_app_url,
        poll_interval=config.polling_interval_seconds,
    )
    tray_icon = create_tray_icon(app, window=window, api_client=api_client)
    tray_icon.show()

    window.show()

    try:
        window.refresh_all()
    except ApiError as exc:  # pragma: no cover - UI Feedback
        QMessageBox.warning(window, "API Fehler", str(exc))

    sys.exit(app.exec())


__all__ = ["main"]
