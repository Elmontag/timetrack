"""Darstellung der Tagesprotokolle."""

from __future__ import annotations

from datetime import date
from typing import Optional

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (QDateEdit, QHBoxLayout, QLabel, QMessageBox,
                               QPushButton, QTableWidget, QTableWidgetItem,
                               QVBoxLayout, QWidget)

from ..api_client import ApiClient, ApiError
from ..models import ProtocolEntry


class ProtocolEditor(QWidget):
    """Tabellarische Darstellung und Bearbeitung der Protokolle."""

    def __init__(self, api_client: ApiClient, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.api_client = api_client
        self.entries: list[ProtocolEntry] = []

        self.date_edit = QDateEdit(self)
        self.date_edit.setCalendarPopup(True)
        self.date_edit.setDate(date.today())

        self.refresh_button = QPushButton("Aktualisieren")
        self.save_button = QPushButton("Änderungen speichern")

        self.refresh_button.clicked.connect(self.refresh)
        self.save_button.clicked.connect(self.save_changes)

        header_layout = QHBoxLayout()
        header_layout.addWidget(QLabel("Datum:"))
        header_layout.addWidget(self.date_edit)
        header_layout.addStretch(1)
        header_layout.addWidget(self.refresh_button)
        header_layout.addWidget(self.save_button)

        self.table = QTableWidget(0, 6)
        self.table.setHorizontalHeaderLabels([
            "Start",
            "Ende",
            "Dauer (Min)",
            "Projekt",
            "Kommentar",
            "Tags",
        ])
        self.table.setEditTriggers(QTableWidget.DoubleClicked | QTableWidget.SelectedClicked | QTableWidget.EditKeyPressed)
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.verticalHeader().setVisible(False)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)

        layout = QVBoxLayout(self)
        layout.addLayout(header_layout)
        layout.addWidget(self.table)

    # ------------------------------------------------------------------
    def refresh(self) -> None:
        """Lädt Protokolle für das gewählte Datum."""

        selected_date = self.date_edit.date().toPython()
        try:
            self.entries = self.api_client.get_protocol_entries(selected_date)
        except ApiError as exc:
            QMessageBox.warning(self, "API Fehler", str(exc))
            return

        self.table.setRowCount(len(self.entries))
        for row, entry in enumerate(self.entries):
            self._populate_row(row, entry)
        self.table.resizeColumnsToContents()

    # ------------------------------------------------------------------
    def save_changes(self) -> None:
        """Schreibt Änderungen zurück zur API."""

        for row, entry in enumerate(self.entries):
            project_item = self.table.item(row, 3)
            comment_item = self.table.item(row, 4)
            tags_item = self.table.item(row, 5)

            project_value = project_item.text().strip() if project_item else ""
            comment_value = comment_item.text().strip() if comment_item else ""
            tags_value = tags_item.text().strip() if tags_item else ""

            entry.project = project_value or None
            entry.comment = comment_value or None
            if tags_value:
                entry.tags = [tag.strip() for tag in tags_value.split(",") if tag.strip()]
            else:
                entry.tags = []

            try:
                self.api_client.update_protocol_entry(entry)
            except ApiError as exc:
                QMessageBox.warning(self, "API Fehler", f"Eintrag {entry.entry_id}: {exc}")
                return

        QMessageBox.information(self, "Gespeichert", "Protokolle wurden aktualisiert.")
        self.refresh()

    # ------------------------------------------------------------------
    def _populate_row(self, row: int, entry: ProtocolEntry) -> None:
        self.table.setItem(row, 0, self._readonly_item(entry.started_at.strftime("%d.%m.%Y %H:%M")))
        end_text = entry.ended_at.strftime("%d.%m.%Y %H:%M") if entry.ended_at else "läuft"
        self.table.setItem(row, 1, self._readonly_item(end_text))
        self.table.setItem(row, 2, self._readonly_item(str(entry.duration_minutes)))

        project_item = QTableWidgetItem(entry.project or "")
        comment_item = QTableWidgetItem(entry.comment or "")
        tags_item = QTableWidgetItem(", ".join(entry.tags))

        project_item.setFlags(project_item.flags() | Qt.ItemIsEditable)
        comment_item.setFlags(comment_item.flags() | Qt.ItemIsEditable)
        tags_item.setFlags(tags_item.flags() | Qt.ItemIsEditable)

        self.table.setItem(row, 3, project_item)
        self.table.setItem(row, 4, comment_item)
        self.table.setItem(row, 5, tags_item)

    @staticmethod
    def _readonly_item(text: str) -> QTableWidgetItem:
        item = QTableWidgetItem(text)
        item.setFlags(Qt.ItemIsSelectable | Qt.ItemIsEnabled)
        return item


__all__ = ["ProtocolEditor"]
