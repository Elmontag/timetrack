# TimeTrack Desktop Companion

Dieses Verzeichnis enthält eine eigenständige Desktopanwendung für Windows, die als Ergänzung zur bestehenden TimeTrack Webanwendung dient. Die App ist mit **PySide6** implementiert und bietet eine moderne Benutzeroberfläche mit System-Tray-Integration.

## Features

- Steuerung der Arbeitszeiterfassung direkt aus dem System Tray (Start, Pause, Stopp).
- Übersichtlicher Dashboard-Tab mit Statusanzeige, laufender Session und Unteraufgaben (Subtracks).
- Verwaltung und Steuerung von Subtracks, inkl. Start/Stopp pro Subtrack.
- Tab für Dienstreisen mit Drag-and-Drop zum Hinzufügen von Dokumenten.
- Tab für die Bearbeitung der tagesrelevanten Protokolleinträge.
- Schnellzugriff auf die Webanwendung über einen Button.
- Robuste API-Anbindung mit automatischer Fehlerbehandlung und Offline-Fallback.

## Anforderungen

- Python 3.11 oder neuer (getestet mit CPython 3.11)
- Abhängigkeiten laut `requirements.txt`
- Zugriff auf die TimeTrack API (Standard: `http://127.0.0.1:8080`)

## Installation

```bash
cd desktop_app
python -m venv .venv
source .venv/Scripts/activate  # unter Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Starten der Anwendung

```bash
python -m timetrack_desktop
```

> Alternativ kann `python main.py` genutzt werden.

## Konfiguration

Konfigurationen wie Basis-URL oder API-Token können in einer `.env` Datei im Verzeichnis `desktop_app` gepflegt werden.

Verfügbare Variablen:

- `TIMETRACK_API_BASE_URL` – Basis der API (Standard: `http://127.0.0.1:8080`)
- `TIMETRACK_API_TOKEN` – Optionales Bearer Token
- `TIMETRACK_WEB_APP_URL` – URL zur Webanwendung (Standard: `http://127.0.0.1:5173`)

## Struktur

```
desktop_app/
├── README.md
├── requirements.txt
├── main.py
└── timetrack_desktop/
    ├── __init__.py
    ├── api_client.py
    ├── app.py
    ├── config.py
    ├── models.py
    └── widgets/
        ├── __init__.py
        ├── business_trips.py
        ├── protocol.py
        ├── status.py
        ├── subtracks.py
        └── tray.py
```

## Entwicklung

Die Anwendung verwendet ein komponentenbasiertes Widget-Layout. Polling erfolgt mittels `QTimer`. API-Antworten werden in dataklassenbasierte Modelle überführt, wodurch UI- und Netzwerkschicht getrennt bleiben.

## Tests

Da es sich um eine GUI-Anwendung handelt, stehen derzeit manuelle Tests im Vordergrund. Für automatisierte Tests kann `pytest-qt` ergänzt werden.

## Hinweise für Windows

- Die System-Tray-Integration benötigt ein aktives Icon (`resources/icon.png`). Ein Fallback-Icon wird zur Laufzeit erzeugt, wenn keine Datei vorliegt.
- Drag & Drop von Dateien erfolgt über den Windows-Explorer.

## Weiterentwicklung

- Upload-Prozess für Dienstreise-Dokumente um Fortschrittsanzeigen erweitern.
- Offline-Modus mit lokalem Cache ausbauen.
- Integration von Desktop-Benachrichtigungen für Statusänderungen.

