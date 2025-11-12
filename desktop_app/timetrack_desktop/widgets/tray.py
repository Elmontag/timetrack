"""System-Tray-Integration."""

from __future__ import annotations

from pathlib import Path

from PySide6.QtGui import QIcon, QPixmap
from PySide6.QtWidgets import (QAction, QApplication, QMenu, QMessageBox,
                               QSystemTrayIcon)

from PySide6.QtCore import Qt

from ..api_client import ApiClient, ApiError

ICON_PATHS = [
    Path(__file__).resolve().parent.parent / "resources" / "icon.png",
    Path(__file__).resolve().parent.parent / "resources" / "icon.ico",
]


def _load_icon() -> QIcon:
    for path in ICON_PATHS:
        if path.exists():
            return QIcon(str(path))
    # Fallback Icon (blaues Quadrat)
    pixmap = QIcon.fromTheme("clock")
    if not pixmap.isNull():
        return pixmap
    pixmap = QPixmap(32, 32)
    pixmap.fill(Qt.blue)
    return QIcon(pixmap)


def create_tray_icon(app: QApplication, *, window, api_client: ApiClient) -> QSystemTrayIcon:
    """Erzeugt den System-Tray-Icon mit Menü."""

    tray_icon = QSystemTrayIcon(_load_icon(), parent=window)
    tray_icon.setToolTip("TimeTrack Desktop")

    menu = QMenu()

    start_action = QAction("Tracking starten", menu)
    pause_action = QAction("Tracking pausieren", menu)
    stop_action = QAction("Tracking stoppen", menu)
    open_action = QAction("Fenster öffnen", menu)
    quit_action = QAction("Beenden", menu)

    def handle_start():
        try:
            api_client.start_tracking()
            window.refresh_status()
        except ApiError as exc:
            QMessageBox.warning(window, "API Fehler", str(exc))

    def handle_pause():
        try:
            api_client.pause_tracking()
            window.refresh_status()
        except ApiError as exc:
            QMessageBox.warning(window, "API Fehler", str(exc))

    def handle_stop():
        try:
            api_client.stop_tracking()
            window.refresh_status()
        except ApiError as exc:
            QMessageBox.warning(window, "API Fehler", str(exc))

    start_action.triggered.connect(handle_start)
    pause_action.triggered.connect(handle_pause)
    stop_action.triggered.connect(handle_stop)
    open_action.triggered.connect(window.show)
    quit_action.triggered.connect(app.quit)

    menu.addAction(start_action)
    menu.addAction(pause_action)
    menu.addAction(stop_action)
    menu.addSeparator()
    menu.addAction(open_action)
    menu.addAction(quit_action)

    tray_icon.setContextMenu(menu)
    return tray_icon


__all__ = ["create_tray_icon"]
