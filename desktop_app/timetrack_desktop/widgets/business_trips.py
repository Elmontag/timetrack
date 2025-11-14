"""Dienstreise-Board mit Drag & Drop."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (QHBoxLayout, QLabel, QListWidget, QListWidgetItem,
                               QMessageBox, QPushButton, QSplitter, QTextEdit,
                               QVBoxLayout, QWidget)

from ..api_client import ApiClient, ApiError
from ..models import BusinessTrip


class TripListWidget(QListWidget):
    """Listet Dienstreisen und akzeptiert Drag & Drop von Dateien."""

    files_dropped = Signal(str, list)

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.setSelectionMode(QListWidget.SingleSelection)
        self.setAcceptDrops(True)
        self.setDragEnabled(False)

    def dragEnterEvent(self, event):  # type: ignore[override]
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
        else:
            event.ignore()

    def dragMoveEvent(self, event):  # type: ignore[override]
        if event.mimeData().hasUrls():
            event.acceptProposedAction()
        else:
            event.ignore()

    def dropEvent(self, event):  # type: ignore[override]
        if not event.mimeData().hasUrls():
            event.ignore()
            return
        item = self.itemAt(event.position().toPoint())
        if not item:
            item = self.currentItem()
        if not item:
            QMessageBox.information(self, "Keine Auswahl", "Bitte zuerst eine Dienstreise auswählen.")
            return
        trip_id = item.data(Qt.UserRole)
        files: list[Path] = []
        for url in event.mimeData().urls():
            if url.isLocalFile():
                files.append(Path(url.toLocalFile()))
        if not files:
            event.ignore()
            return
        self.files_dropped.emit(trip_id, files)
        event.acceptProposedAction()


class BusinessTripBoard(QWidget):
    """Stellt Dienstreisen samt Dokumentverwaltung dar."""

    def __init__(self, api_client: ApiClient, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.api_client = api_client
        self.trips: list[BusinessTrip] = []

        self.trip_list = TripListWidget()
        self.trip_list.itemSelectionChanged.connect(self._handle_selection_changed)
        self.trip_list.files_dropped.connect(self._handle_files_dropped)

        self.refresh_button = QPushButton("Aktualisieren")
        self.refresh_button.clicked.connect(self.refresh)

        self.detail_text = QTextEdit()
        self.detail_text.setReadOnly(True)
        self.document_list = QListWidget()
        self.document_list.setSelectionMode(QListWidget.NoSelection)

        sidebar_layout = QVBoxLayout()
        sidebar_layout.addWidget(QLabel("Dienstreisen"))
        sidebar_layout.addWidget(self.trip_list)
        sidebar_layout.addWidget(self.refresh_button)

        detail_layout = QVBoxLayout()
        detail_layout.addWidget(QLabel("Details"))
        detail_layout.addWidget(self.detail_text)
        detail_layout.addWidget(QLabel("Dokumente (per Drag & Drop hinzufügen)"))
        detail_layout.addWidget(self.document_list)

        wrapper = QWidget()
        wrapper.setLayout(detail_layout)

        splitter = QSplitter()
        splitter.addWidget(self._wrap_widget(sidebar_layout))
        splitter.addWidget(wrapper)
        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 2)

        layout = QHBoxLayout(self)
        layout.addWidget(splitter)

    def _wrap_widget(self, layout: QVBoxLayout) -> QWidget:
        container = QWidget()
        container.setLayout(layout)
        return container

    # ------------------------------------------------------------------
    def refresh(self) -> None:
        try:
            self.trips = self.api_client.list_business_trips()
        except ApiError as exc:
            QMessageBox.warning(self, "API Fehler", str(exc))
            return

        self.trip_list.clear()
        for trip in self.trips:
            item = QListWidgetItem(f"{trip.destination} ({trip.start_date:%d.%m.%Y} - {trip.end_date:%d.%m.%Y})")
            item.setData(Qt.UserRole, trip.trip_id)
            item.setToolTip(trip.purpose or "")
            self.trip_list.addItem(item)
        if self.trips:
            self.trip_list.setCurrentRow(0)
        else:
            self.detail_text.setPlainText("Keine Dienstreisen gefunden.")
            self.document_list.clear()

    # ------------------------------------------------------------------
    def _handle_selection_changed(self) -> None:
        trip = self._current_trip()
        if not trip:
            self.detail_text.clear()
            self.document_list.clear()
            return
        details = (
            f"Ziel: {trip.destination}\n"
            f"Zeitraum: {trip.start_date:%d.%m.%Y} – {trip.end_date:%d.%m.%Y}\n"
        )
        if trip.purpose:
            details += f"Zweck: {trip.purpose}\n"
        self.detail_text.setPlainText(details)

        self.document_list.clear()
        if trip.documents:
            for doc in trip.documents:
                self.document_list.addItem(doc)
        else:
            self.document_list.addItem("Keine Dokumente hinterlegt.")

    def _handle_files_dropped(self, trip_id: str, files: list[Path]) -> None:
        for file_path in files:
            try:
                self.api_client.upload_business_trip_document(trip_id, file_path)
            except ApiError as exc:
                QMessageBox.warning(self, "Upload fehlgeschlagen", f"{file_path.name}: {exc}")
                return
        QMessageBox.information(self, "Upload", "Dokumente wurden übertragen.")
        self.refresh()
        self._reselect_trip(trip_id)

    def _current_trip(self) -> Optional[BusinessTrip]:
        current_item = self.trip_list.currentItem()
        if not current_item:
            return None
        trip_id = current_item.data(Qt.UserRole)
        return next((trip for trip in self.trips if trip.trip_id == trip_id), None)

    def _reselect_trip(self, trip_id: str) -> None:
        for row in range(self.trip_list.count()):
            item = self.trip_list.item(row)
            if item.data(Qt.UserRole) == trip_id:
                self.trip_list.setCurrentRow(row)
                break


__all__ = ["BusinessTripBoard"]
