"""Dashboard und Statusansicht."""

from __future__ import annotations

from typing import Optional

from PySide6.QtCore import QTimer, Qt
from PySide6.QtGui import QDesktopServices, QFont, QUrl
from PySide6.QtWidgets import (QFormLayout, QGridLayout, QGroupBox,
                               QHBoxLayout, QLabel, QLineEdit, QMainWindow,
                               QMessageBox, QPushButton, QSplitter, QTextEdit,
                               QVBoxLayout, QWidget)

from ..api_client import ApiClient, ApiError
from ..models import TrackingStatus
from .business_trips import BusinessTripBoard
from .protocol import ProtocolEditor
from .subtracks import SubtrackManager


class StatusDashboard(QMainWindow):
    """Hauptfenster der Desktop-Anwendung."""

    def __init__(self, api_client: ApiClient, *, web_app_url: str, poll_interval: int = 30,
                 parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.api_client = api_client
        self.web_app_url = web_app_url
        self.poll_interval = poll_interval
        self.setWindowTitle("TimeTrack Desktop Companion")
        self.resize(1180, 720)

        self.status_label = QLabel("Unbekannt")
        font = QFont()
        font.setPointSize(20)
        font.setBold(True)
        self.status_label.setFont(font)

        self.session_label = QLabel("-")
        self.subtrack_label = QLabel("-")

        self.project_input = QLineEdit()
        self.comment_input = QTextEdit()
        self.comment_input.setPlaceholderText("Kommentar für Start/Pause/Stop")
        self.comment_input.setFixedHeight(80)

        self.start_button = QPushButton("Starten")
        self.pause_button = QPushButton("Pausieren")
        self.stop_button = QPushButton("Stoppen")
        self.web_button = QPushButton("Webanwendung öffnen")

        self.start_button.clicked.connect(self._handle_start)
        self.pause_button.clicked.connect(self._handle_pause)
        self.stop_button.clicked.connect(self._handle_stop)
        self.web_button.clicked.connect(self._open_web_app)

        self.subtrack_manager = SubtrackManager(api_client)
        self.protocol_editor = ProtocolEditor(api_client)
        self.business_trip_board = BusinessTripBoard(api_client)

        self._build_ui()

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.refresh_status)
        self.timer.start(max(self.poll_interval * 1000, 5000))

    # ------------------------------------------------------------------
    def _build_ui(self) -> None:
        dashboard_widget = QWidget()
        dashboard_layout = QHBoxLayout(dashboard_widget)

        left_panel = QVBoxLayout()
        left_panel.addWidget(self._build_status_group())
        left_panel.addWidget(self._build_control_group())
        left_panel.addStretch(1)

        dashboard_layout.addLayout(left_panel)
        dashboard_layout.addWidget(self.subtrack_manager, stretch=1)

        secondary_splitter = QSplitter()
        secondary_splitter.addWidget(self.business_trip_board)
        secondary_splitter.addWidget(self.protocol_editor)
        secondary_splitter.setStretchFactor(0, 1)
        secondary_splitter.setStretchFactor(1, 1)

        central_splitter = QSplitter()
        central_splitter.setOrientation(Qt.Vertical)
        central_splitter.addWidget(dashboard_widget)
        central_splitter.addWidget(secondary_splitter)
        central_splitter.setStretchFactor(0, 0)
        central_splitter.setStretchFactor(1, 1)

        central_widget = QWidget()
        central_layout = QVBoxLayout(central_widget)
        central_layout.addWidget(central_splitter)

        self.setCentralWidget(central_widget)

    def _build_status_group(self) -> QGroupBox:
        group = QGroupBox("Aktueller Status")
        layout = QGridLayout(group)

        layout.addWidget(QLabel("Tracking:"), 0, 0)
        layout.addWidget(self.status_label, 0, 1)
        layout.addWidget(QLabel("Startzeit:"), 1, 0)
        layout.addWidget(self.session_label, 1, 1)
        layout.addWidget(QLabel("Aktiver Subtrack:"), 2, 0)
        layout.addWidget(self.subtrack_label, 2, 1)

        return group

    def _build_control_group(self) -> QGroupBox:
        group = QGroupBox("Steuerung")
        form = QFormLayout(group)
        form.addRow("Projekt", self.project_input)
        form.addRow("Kommentar", self.comment_input)

        button_row = QHBoxLayout()
        button_row.addWidget(self.start_button)
        button_row.addWidget(self.pause_button)
        button_row.addWidget(self.stop_button)
        button_row.addStretch(1)
        button_row.addWidget(self.web_button)

        form.addRow(button_row)
        return group

    # ------------------------------------------------------------------
    def refresh_all(self) -> None:
        self.refresh_status()
        self.subtrack_manager.refresh()
        self.protocol_editor.refresh()
        self.business_trip_board.refresh()

    def refresh_status(self) -> None:
        try:
            status = self.api_client.get_tracking_status()
        except ApiError as exc:
            self.status_label.setText("Fehler")
            self.session_label.setText(str(exc))
            return

        self._apply_status(status)

    def _apply_status(self, status: TrackingStatus) -> None:
        if status.is_tracking:
            self.status_label.setText("Läuft")
            self.status_label.setStyleSheet("color: #0f9d58;")
        else:
            self.status_label.setText("Gestoppt")
            self.status_label.setStyleSheet("color: #db4437;")

        if status.started_at:
            self.session_label.setText(status.started_at.strftime("%d.%m.%Y %H:%M"))
        else:
            self.session_label.setText("-")

        self.subtrack_label.setText(status.active_subtrack or "-")

    # ------------------------------------------------------------------
    def _handle_start(self) -> None:
        comment = self.comment_input.toPlainText().strip() or None
        project = self.project_input.text().strip() or None
        subtrack = self.subtrack_manager.current_identifier()
        try:
            self.api_client.start_tracking(project=project, comment=comment, subtrack=subtrack)
        except ApiError as exc:
            QMessageBox.warning(self, "Start fehlgeschlagen", str(exc))
            return
        self.comment_input.clear()
        self.refresh_status()
        self.subtrack_manager.refresh()
        QMessageBox.information(self, "Tracking", "Tracking gestartet.")

    def _handle_pause(self) -> None:
        comment = self.comment_input.toPlainText().strip() or None
        try:
            self.api_client.pause_tracking(comment=comment)
        except ApiError as exc:
            QMessageBox.warning(self, "Pause fehlgeschlagen", str(exc))
            return
        self.comment_input.clear()
        self.refresh_status()
        QMessageBox.information(self, "Tracking", "Tracking pausiert.")

    def _handle_stop(self) -> None:
        comment = self.comment_input.toPlainText().strip() or None
        try:
            self.api_client.stop_tracking(comment=comment)
        except ApiError as exc:
            QMessageBox.warning(self, "Stop fehlgeschlagen", str(exc))
            return
        self.comment_input.clear()
        self.refresh_status()
        self.subtrack_manager.refresh()
        QMessageBox.information(self, "Tracking", "Tracking gestoppt.")

    def _open_web_app(self) -> None:
        QDesktopServices.openUrl(QUrl(self.web_app_url))


__all__ = ["StatusDashboard"]
