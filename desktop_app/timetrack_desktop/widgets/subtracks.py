"""Subtrack-Verwaltung."""

from __future__ import annotations

from typing import Optional

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (QHBoxLayout, QInputDialog, QListWidget,
                               QListWidgetItem, QMessageBox, QPushButton,
                               QVBoxLayout, QWidget)

from ..api_client import ApiClient, ApiError
from ..models import Subtrack


class SubtrackManager(QWidget):
    """Widget zur Verwaltung von Subtracks."""

    subtrack_selected = Signal(str)

    def __init__(self, api_client: ApiClient, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.api_client = api_client
        self._subtracks: list[Subtrack] = []

        self.list_widget = QListWidget()
        self.list_widget.itemSelectionChanged.connect(self._handle_selection_changed)
        self.list_widget.itemDoubleClicked.connect(self._handle_toggle)

        self.add_button = QPushButton("Neu")
        self.toggle_button = QPushButton("Start/Stopp")
        self.note_button = QPushButton("Notiz bearbeiten")
        self.refresh_button = QPushButton("Aktualisieren")

        self.add_button.clicked.connect(self._handle_add)
        self.toggle_button.clicked.connect(self._handle_toggle)
        self.note_button.clicked.connect(self._handle_edit_note)
        self.refresh_button.clicked.connect(self.refresh)

        button_row = QHBoxLayout()
        button_row.addWidget(self.add_button)
        button_row.addWidget(self.toggle_button)
        button_row.addWidget(self.note_button)
        button_row.addStretch(1)
        button_row.addWidget(self.refresh_button)

        layout = QVBoxLayout(self)
        layout.addWidget(self.list_widget)
        layout.addLayout(button_row)

    # ------------------------------------------------------------------
    def refresh(self) -> None:
        """Lädt die Subtracks neu."""

        try:
            self._subtracks = self.api_client.list_subtracks()
        except ApiError as exc:
            QMessageBox.warning(self, "API Fehler", str(exc))
            return

        self.list_widget.clear()
        for subtrack in self._subtracks:
            item = QListWidgetItem(subtrack.title)
            item.setData(Qt.UserRole, subtrack.identifier)
            if subtrack.is_active:
                item.setText(f"🟢 {subtrack.title}")
            if subtrack.note:
                item.setToolTip(subtrack.note)
            self.list_widget.addItem(item)

    # ------------------------------------------------------------------
    def current_identifier(self) -> Optional[str]:
        current_item = self.list_widget.currentItem()
        if not current_item:
            return None
        return current_item.data(Qt.UserRole)

    # ------------------------------------------------------------------
    def _handle_selection_changed(self) -> None:
        identifier = self.current_identifier()
        if identifier:
            self.subtrack_selected.emit(identifier)

    def _handle_add(self) -> None:
        title, ok = QInputDialog.getText(self, "Neuer Subtrack", "Titel")
        if not ok or not title.strip():
            return
        note, _ = QInputDialog.getMultiLineText(self, "Notiz", "Notiz", "")
        try:
            subtrack = self.api_client.create_subtrack(title.strip(), note=note.strip() or None)
        except ApiError as exc:
            QMessageBox.warning(self, "API Fehler", str(exc))
            return
        self.refresh()
        self._select_subtrack(subtrack.identifier)

    def _handle_toggle(self, item: Optional[QListWidgetItem] = None) -> None:
        identifier = None
        if isinstance(item, QListWidgetItem):
            identifier = item.data(Qt.UserRole)
        else:
            identifier = self.current_identifier()
        if not identifier:
            return
        try:
            self.api_client.toggle_subtrack(identifier)
        except ApiError as exc:
            QMessageBox.warning(self, "API Fehler", str(exc))
            return
        self.refresh()
        self._select_subtrack(identifier)

    def _handle_edit_note(self) -> None:
        identifier = self.current_identifier()
        if not identifier:
            return
        subtrack = next((s for s in self._subtracks if s.identifier == identifier), None)
        if not subtrack:
            return
        note, ok = QInputDialog.getMultiLineText(self, "Notiz bearbeiten", "Notiz", subtrack.note or "")
        if not ok:
            return
        subtrack.note = note.strip() or None
        try:
            self.api_client.save_subtrack(subtrack)
        except ApiError as exc:
            QMessageBox.warning(self, "API Fehler", str(exc))
            return
        self.refresh()
        self._select_subtrack(identifier)

    def _select_subtrack(self, identifier: str) -> None:
        for index in range(self.list_widget.count()):
            item = self.list_widget.item(index)
            if item.data(Qt.UserRole) == identifier:
                self.list_widget.setCurrentItem(item)
                return


__all__ = ["SubtrackManager"]
