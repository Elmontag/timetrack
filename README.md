# TimeTrack MVP

TimeTrack ist eine selbstgehostete Stempeluhr mit React-Frontend und FastAPI-Backend. Dieses MVP bildet die Kernanforderungen ab: Arbeitszeiterfassung per Start/Pause/Stop (inkl. Permalink-Aktionen), Tages- und Monatsübersichten, Verwaltung von Urlaub/AU, Exporte als PDF oder Excel sowie ein tokenbasiertes Sicherheitssystem.

## Architekturüberblick

```text
┌──────────────────────────┐         ┌────────────────────────┐
│ Frontend (Vite + React)  │  HTTPS  │ Backend (FastAPI)      │
│ Tailwind UI, API-Client  │◀───────▶│ SQLAlchemy + SQLite    │
└───────────────▲──────────┘         │ Export (PDF/XLSX)      │
                │                    │ Token & Allowlist      │
                │                    └───────────▲────────────┘
                │                                │
                │                                │ Persistenz / Artefakte
                ▼                                ▼
         Browser / PWA                    `./data/` (DB & Exporte)
```

* **Persistenz:** Standardmäßig SQLite (Datei in `./data/timetrack.db`). Optional kann später JSON- oder ein anderes DB-Backend ergänzt werden.
* **Zugriffsschutz:** IP-Allowlist (default `localhost`), HMAC-signierte Tokens für Permalinks, optionale Proxy-Unterstützung.
* **Offline-freundlich:** keine externen Dienste nötig; alle Artefakte liegen lokal.

## Features im MVP

- ⏱️ **Arbeitszeit starten/pausieren/stoppen** – direkt in der UI oder per Token-Link (`/a/<token>`)
- 📅 **Kalender- und Tagesübersichten** – Tagesprotokoll & Monatskennzahlen (Arbeitszeit, Pausen, Überstunden)
- 🌴 **Urlaub & Arbeitsunfähigkeit** – Erfassung inkl. Kommentar & Genehmigungsstatus
- 📤 **Exporte** – Stundenzettel oder Abwesenheiten als PDF oder XLSX, Ablage im Export-Verzeichnis
- 🔐 **Sicherheit** – IP-Allowlist, HMAC-Token mit TTL, optional IP-Bindung & Einmal-Token
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
export TT_ALLOW_IPS="127.0.0.1,192.168.0.0/24"
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

Die Compose-Datei baut zwei Images (Backend & Frontend). Artefakte landen in `./data` (bind-mount). Für Produktion empfiehlt sich ein vorgeschalteter Reverse Proxy (TLS, Basic Auth, Rate-Limit).

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
| `/days?from&to`       | GET     | Tages-Summaries im Zeitraum     |
| `/leaves`             | GET/POST| Urlaub/AU verwalten             |
| `/exports`            | POST    | Export (PDF/XLSX) erstellen     |
| `/exports/{id}`       | GET     | Export herunterladen            |
| `/tokens`             | POST    | Aktions-Token erzeugen          |
| `/a/{token}`          | GET     | Token ausführen (Start/Pause/…) |

## Frontend-Einblicke

Die React-App bietet einen klar strukturierten Flow:

1. **Dashboard:** Session-Controls, Statusindikator, API-Endpunktanzeige
2. **Tagesprotokoll:** Filterbares Log aller Sitzungen
3. **Monatsübersicht:** Kennzahlen + tabellarische Ansicht
4. **Abwesenheiten:** Formular + Liste für Urlaub/AU
5. **Exporte:** Auswahl Zeitraum/Typ/Format mit direktem Download

Tailwind CSS sorgt für ein dunkles, kontrastreiches Theme, optimiert für Desktop & Tablet.

## Weiterführende Ideen

- CalDAV-Import & Mapping in die Inbox
- Erweiterte Rollen/Rechte (mehrere Benutzer)
- JSON-Statefiles als Alternative zu SQLite
- Hintergrundjobs via APScheduler (bereits als Abhängigkeit vorhanden)
- Prometheus-/Metrics-Endpunkte

---

Viel Spaß beim Tracken! Bei Fragen oder Feedback gerne Issues eröffnen.
