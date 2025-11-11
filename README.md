# TimeTrack MVP

TimeTrack ist eine selbstgehostete Stempeluhr mit React-Frontend und FastAPI-Backend. Dieses MVP bildet die Kernanforderungen ab: Arbeitszeiterfassung per Start/Pause/Stop (inkl. Permalink-Aktionen), Tages- und Monatsübersichten, Verwaltung von Urlaub/AU, Exporte als PDF oder Excel sowie ein tokenbasiertes Sicherheitssystem.

## Architekturüberblick

```text
┌──────────────────────────┐         ┌────────────────────────┐
│ Frontend (Vite + React)  │  HTTPS  │ Backend (FastAPI)      │
│ Tailwind UI, API-Client  │◀───────▶│ SQLAlchemy + SQLite    │
└───────────────▲──────────┘         │ Export (PDF/XLSX)      │
                │                    │ Token & Blocklist      │
                │                    └───────────▲────────────┘
                │                                │
                │                                │ Persistenz / Artefakte
                ▼                                ▼
         Browser / PWA                    `./data/` (DB & Exporte)
```

* **Persistenz:** Standardmäßig SQLite (Datei in `./data/timetrack.db`). Optional kann später JSON- oder ein anderes DB-Backend ergänzt werden.
* **Zugriffsschutz:** IP-Blocklist (optional), HMAC-signierte Tokens für Permalinks, optionale Proxy-Unterstützung.
* **Offline-freundlich:** keine externen Dienste nötig; alle Artefakte liegen lokal.

## Features im MVP

- ⏱️ **Arbeitszeit starten/pausieren/stoppen** – direkt in der UI oder per Token-Link (`/a/<token>`) inkl. optionaler Startzeit und Live-Laufzeitanzeige
- 🗓️ **Mein Tag Dashboard** – Startseite mit Laufzeituhr, Tagesstatistik, aktuellem Kalender und Subtracks (Meetings, Projekte, Notizen)
- 📝 **Nachträgliche Erfassung** – Meetings & vergessene Blöcke per Formular nachtragen
- ✏️ **Protokoll bearbeiten** – Einträge direkt im Tagesprotokoll korrigieren oder löschen
- 📅 **Kalender- und Tagesübersichten** – Tages-, Monats- und Jahresansicht mit Stundenanalyse
- 🌴 **Urlaub & Arbeitsunfähigkeit** – Erfassung inkl. Kommentar & Genehmigungsstatus
- 📆 **Kalenderabgleich** – Termine im internen Kalender als „Teilgenommen“/„Nicht teilgenommen“ markieren
- 📤 **Exporte** – Stundenzettel oder Abwesenheiten als PDF oder XLSX, Ablage im Export-Verzeichnis
- 🔐 **Sicherheit** – IP-Blocklist, HMAC-Token mit TTL, optional IP-Bindung & Einmal-Token
- ⚙️ **Einstellungsmenü** – IP-Blocklist, Soll-Stunden (Tag/Woche) sowie CalDAV-Zugang mit Mehrfachauswahl der verfügbaren Kalender bequem in der UI pflegen
- 🛠️ **API** – REST/JSON, OpenAPI-Schema (`/docs`) und Healthcheck (`/healthz`)

## Voraussetzungen

- Node.js ≥ 20 (für das Frontend)
- Python 3.11 (über `.python-version` via pyenv vorgegeben)
- Poetry/Pipenv optional, im MVP wird `pip` genutzt
- Für Docker-Betrieb: Docker & Docker Compose v2

## Backend installieren & starten

```bash
# Abhängigkeiten installieren
pip install -r backend/requirements.txt

# Entwicklungsserver starten
PYTHONPATH=backend uvicorn app.main:app --reload --host 127.0.0.1 --port 8080
```

Konfiguration via Environment-Variablen (Default-Werte siehe `backend/app/config.py`):

```bash
export TT_HOST=127.0.0.1
export TT_PORT=8080
export TT_TOKEN_SECRET="super-secret"
export TT_BLOCK_IPS="192.168.0.0/24"
export TT_EXPECTED_DAILY_HOURS=8
export TT_EXPECTED_WEEKLY_HOURS=40
```

Beim ersten Start werden Datenbank & Exportordner automatisch angelegt.

## Frontend entwickeln & bauen

```bash
cd frontend
npm install
npm run dev   # http://127.0.0.1:5173

# Produktionsbuild erzeugen
npm run build
```

Per Umgebungsvariable `VITE_API_BASE` lässt sich die API-URL anpassen (default `http://127.0.0.1:8080`).

## Docker Compose

```bash
docker compose up --build
# API: http://127.0.0.1:8080  |  Frontend: http://127.0.0.1:5173
```

Die Compose-Datei baut zwei Images (Backend & Frontend). Artefakte landen in `./data` (bind-mount). Standardmäßig blockiert das Backend keine Adressen; bei Bedarf kannst du über `TT_BLOCK_IPS` gezielt Netze sperren (z. B. öffentliche Adressbereiche). Für Produktion empfiehlt sich ein vorgeschalteter Reverse Proxy (TLS, Basic Auth, Rate-Limit).

## Tests

```bash
# Backend-Tests (Pytest)
PYTHONPATH=backend pytest backend/tests

# Frontend Build (führt Linting & Bundling aus)
cd frontend && npm run build
```

Die Backend-Tests verifizieren den kompletten Workflow (Start/Pause/Stop, Exporte, Token-Aufrufe). Der Vite-Build stellt sicher, dass das UI ohne Fehler kompiliert.

## API-Schnellstart

| Route                 | Methode | Beschreibung                    |
|-----------------------|---------|---------------------------------|
| `/healthz`            | GET     | Bereitschaftsprobe              |
| `/work/start`         | POST    | Arbeitszeit starten             |
| `/work/pause`         | POST    | Pause / Fortsetzen              |
| `/work/stop`          | POST    | Arbeitszeit stoppen             |
| `/work/day/{yyyy-mm-dd}` | GET  | Sitzungen eines Tages           |
| `/work/subtracks/{yyyy-mm-dd}` | GET  | Subtracks (Meetings/Tags) des Tages |
| `/work/subtracks`        | POST    | Subtrack für einen Tag erfassen |
| `/work/manual`        | POST    | Arbeitszeit nachtragen          |
| `/work/session/{id}`  | PATCH   | Protokolleintrag bearbeiten     |
| `/work/session/{id}`  | DELETE  | Protokolleintrag löschen        |
| `/days?from&to`       | GET     | Tages-Summaries im Zeitraum     |
| `/leaves`             | GET/POST| Urlaub/AU verwalten             |
| `/calendar/events`    | GET/POST/PATCH | Kalendertermine & Teilnahme |
| `/caldav/calendars`   | GET     | Serverseitig verfügbare CalDAV-Kalender |
| `/exports`            | POST    | Export (PDF/XLSX) erstellen     |
| `/exports/{id}`       | GET     | Export herunterladen            |
| `/tokens`             | POST    | Aktions-Token erzeugen          |
| `/a/{token}`          | GET     | Token ausführen (Start/Pause/…) |
| `/settings`           | GET/PUT | Laufende Einstellungen verwalten |

## Frontend-Einblicke

Die React-App bietet einen klar strukturierten Flow:

1. **Mein Tag:** Laufzeituhr (Header-Bar), Tagesstatistik, Kalendereinträge und Subtrack-Verwaltung
2. **Arbeitszeit:** Protokoll, Nachtrag-Formular & Analyse (Tag/Monat/Jahr)
3. **Abwesenheiten:** Formular + Liste für Urlaub/AU
4. **Kalender:** Termine importieren/erfassen und Teilnahme markieren
5. **Exporte:** Zeitraum/Typ/Format wählen mit direktem Download
6. **Einstellungen:** IP-Blocklist, Soll-Stunden & CalDAV-Zugang per UI pflegen

Tailwind CSS sorgt für ein dunkles, kontrastreiches Theme, optimiert für Desktop & Tablet.

## Weiterführende Ideen

- CalDAV-Import & Mapping in die Inbox
- Erweiterte Rollen/Rechte (mehrere Benutzer)
- JSON-Statefiles als Alternative zu SQLite
- Hintergrundjobs via APScheduler (bereits als Abhängigkeit vorhanden)
- Prometheus-/Metrics-Endpunkte

---

Viel Spaß beim Tracken! Bei Fragen oder Feedback gerne Issues eröffnen.
