# TimeTrack

> Deine persönliche, selbstgehostete Stempeluhr – mit Permalink‑Aktionen, Kalenderübersicht, Exporten (PDF/Excel) und CalDAV‑Sync. Implementiert mit **React + Vite**, **FastAPI**, **SQLite** (optional JSON‑Statefiles) und **Tailwind CSS**. Bereitgestellt via **Docker Compose**.

---

## Features

* **Start / Pause / Stop per Permalink** – Ein Klick (oder QR‑Scan) genügt; ideal für Desktop‑Shortcuts, Handy‑Widgets oder NFC‑Tags.
* **Arbeitszeiterfassung pro Tag** – mit Kommentaren/Notizen, automatischer Pausenunterstützung und Korrekturmodus.
* **Verlauf & Überblick** – Kalender‑ und Listenansicht, Filter (Zeitraum, Projekt/Tag, Status), Summen & Tages-/Monats‑KPIs.
* **Urlaub & Arbeitsunfähigkeit (AU)** – separate Erfassung inkl. Genehmigungsstatus (optional), Anhang (z. B. AU‑Nachweis), Auswertung.
* **Exporte** – Monats‑/Wochen‑Stundenzettel, Urlaubs- und AU‑Listen als **PDF** und **Excel (XLSX)**.
* **CalDAV‑Sync** – Termine aus CalDAV‑Kalendern abrufen; **gezielt auswählen** und als Arbeitszeiteinträge übernehmen (wahlweise mit Projekt/Tag‑Mapping).
* **Lokaler Zugriff & IP‑Allowlist** – by default nur von `127.0.0.1` erreichbar; optional Freigabe für definierte IP‑Ranges.
* **Offline‑freundlich** – Primär **SQLite**; alternativ **JSON‑Statefiles** für sehr schlanke/portierbare Setups.
* **Saubere API** – dokumentiert via OpenAPI/Swagger; HMAC‑signierte Aktions‑Tokens (Permalinks) mit Ablauf & Scope.
* **Unkomplizierte Einstellungen** Alle Einstellungen für Kalendersync, Nutzerdaten und Personendaten, IP-Allowlist, etc. können in einem übersichtlichen Einstellungsmenü angepasst werden
---

## Architektur

```
┌──────────────────────┐         ┌──────────────────────┐
│      Frontend        │  HTTP   │        Backend        │
│ React + Vite +       │ <──────▶│ FastAPI + Uvicorn     │
│ Tailwind (SPA/PWA)   │         │  ├─ SQLite (SQLAlchemy)
└─────────▲────────────┘         │  ├─ CalDAV Client
          │                      │  ├─ Export (PDF/XLSX)
          │ Web API (OpenAPI)    │  └─ Scheduler (APScheduler)
          │                      └───────────▲───────────┘
          │                                  │
          │                                  │File/DB Volumes
          ▼                                  ▼
      Browser/Apps                    `./data/` (DB, exports)
```

**Persistenz**: Standard = SQLite‐Datei; optional JSON‑Statefiles (flach, append‑only + Kompaktierungs‑Job).
**Scheduler/Agents**: integrierter APScheduler (ohne externe Queue), optional Redis‑Backend für Skalierung.

---

## Datenmodell (Kurzüberblick)

* `work_sessions` – Start/Stop/Pause‑Events, berechnete Dauer, Kommentar, Tags/Projekt.
* `day_summaries` – aggregierte Tageswerte (Arbeits-/Pausenzeit, Überstunden, Status). Wird durch Jobs gepflegt.
* `leave_entries` – Urlaub/AU inkl. Zeitraum, Typ, Kommentar, Nachweis.
* `calendar_items` – importierte CalDAV‑Termine + Mapping auf Arbeitszeiteinträge.
* `action_tokens` – HMAC‑signierte, zeitlich begrenzte Permalinks (`/a/<token>`; Scopes: start|pause|stop|toggle|project:XYZ; optional Single‑Use).
* `exports` – Export‑Artefakte (Dateipfad, Format, Zeitraum, Signatur/Checksumme).
* `audit_log` – sicherheitsrelevante Ereignisse (Login, Token‑Verwendung, IP‑Blockierungen, Exporte).

---

## Environment-Variablen

    environment:
      # Sicherheit & Netzwerk
      - TT_HOST=127.0.0.1        # Standard: nur Loopback
      - TT_PORT=8080
      - TT_ALLOW_IPS=127.0.0.1,192.168.1.0/24  # optionale Allowlist
      - TT_BEHIND_PROXY=false     # wenn true: X-Forwarded-For beachten
      # Persistenz
      - TT_STORAGE=sqlite         # sqlite | json
      - TT_SQLITE_PATH=/data/timetrack.db
      - TT_JSON_DIR=/data/state
      # CalDAV
      - TT_CALDAV_URL=
      - TT_CALDAV_USER=
      - TT_CALDAV_PASSWORD=
      - TT_CALDAV_DEFAULT_CAL=
      # Exporte
      - TT_EXPORT_DIR=/data/exports
      - TT_EXPORT_PDF_ENGINE=reportlab  # reportlab | weasyprint
      - TT_EXPORT_XLSX_ENGINE=xlsxwriter
      # Zeitzone & Lokalisierung
      - TZ=Europe/Berlin
      - TT_LOCALE=de-DE


  # Optional: Reverse Proxy mit IP-Allowlist, TLS, Basic Auth
  # proxy:
  #   image: caddy:2
  #   ports:
  #     - "443:443"
  #   volumes:
  #     - ./Caddyfile:/etc/caddy/Caddyfile:ro
  #     - ./caddy-data:/data
  #   depends_on:
  #     - api
  #     - web
```

**Starten**

```bash
docker compose up -d
# Frontend: http://127.0.0.1:5173  |  API: http://127.0.0.1:8080
```

> Produktion: Empfohlen ist `api` & `web` weiter lokal zu binden und per Reverse Proxy (Caddy/nginx/Traefik) gezielt IP‑Ranges freizugeben und TLS/Basic‑Auth vorzuschalten.

---

## Sicherheit (lokaler Zugriff & Allowlist)

* **Default nur localhost**: `TT_HOST=127.0.0.1`, Port nicht ins LAN exponieren.
* **IP‑Allowlist**: `TT_ALLOW_IPS` akzeptiert CSV von IPs/CIDRs. Middleware blockt alle anderen Requests (403).

  * Bei `TT_BEHIND_PROXY=true` wird die Quell‑IP aus `X-Forwarded-For` gelesen (nur vertrauenswürdig hinter eigenem Proxy!).
* **Permalink‑Tokens**: HMAC‑signiert, Scope‑basiert, optional IP‑gebunden, Ablaufzeit (TTL) & einmalige Nutzung. Nur `GET` auf `/a/<token>`.
* **Rate‑Limit**: Einfaches Token‑Bucket pro IP/Route aktiv; konfigurierbar (`TT_RATE_LIMIT=*`).
* **CORS/CSRF**: CORS standardmäßig `same-origin`; CSRF‑Schutz für state‑ändernde UI‑POSTs aktiv. Token‑Links sind CSRF‑resistent (kein Cookie‑Zwang, rein tokenbasiert).
* **Headers**: Strict‑Transport‑Security (bei TLS), Content‑Security‑Policy (strikt), Referrer‑Policy, X‑Frame‑Options `DENY`.
* **Audit‑Log**: Alle Token‑Nutzungen und geblockten IPs werden geloggt.

---

## Nutzung

### 1) Permalinks

* **Erzeugen**: Im UI unter *Einstellungen → Permalink‑Aktionen* (`start`, `pause`, `stop`, `toggle`, optional: Projekt/Tag).
* **Verwenden**: Link als Browser‑Favorit, Homescreen‑Icon oder QR‑Code/NFC nutzen.
* **Sicherheit**: Tokens sind zeitlich befristet; bei Verlust im UI sofort widerrufen.

### 2) Tagesansicht & Kommentare

* Start/Pause/Stop, manuelles Korrigieren, **Kommentar** pro Session/Tag.
* Automatische Pausenvorschläge (konfigurierbare Regeln; z. B. 30 min nach 6 h).

### 3) Kalender- & Listenansicht

* Monat/Agenda, Filter (Projekt/Tag, Typ: Arbeit/Urlaub/AU), Summen, Export‑Shortcuts.

### 4) Urlaub & AU

* Eintragen mit Zeitraum, Typ, Kommentar und optionalem Anhang.
* Übersicht, Resturlaubsberechnung (Jahreskontingent), Export.

### 5) CalDAV‑Import

* CalDAV‑Zugang in *Einstellungen → CalDAV* hinterlegen.
* Termine werden **nur vorgemerkt**; im Import‑Dialog können einzelne Termine selektiert, mit Projekt/Tag versehen und übernommen werden.
* Regeln: z. B. „Kalender *Dienst* → Tag *KundeA*“, „Titel enthält *Workshop* → Typ *Arbeit*, Standarddauer Titel‑Dauer“.

### 6) Exporte (PDF/XLSX)

* Stundenzettel (Monat/Woche, mit Kommentaren), Urlaubs‑ und AU‑Übersichten.
* Exporthistorie mit Hash/Signatur, Download via UI oder `/exports/{id}`.

---

## Entwickeln

### Repo‑Struktur (Vorschlag)

```
/                      
├─ frontend/           # React + Vite + Tailwind
│  ├─ src/
│  └─ vite.config.ts
├─ backend/            # FastAPI + SQLAlchemy/SQLModel + APScheduler
│  ├─ app/
│  │  ├─ api/          # Routers (work, leaves, caldav, exports, tokens)
│  │  ├─ core/         # settings, security, deps, middleware
│  │  ├─ models/       # SQLAlchemy models
│  │  ├─ services/     # Export, CalDAV, Tokens, Rules, Reports
│  │  ├─ agents/       # Scheduler/Jobs
│  │  ├─ schemas/      # Pydantic
│  │  ├─ utils/
│  │  └─ main.py       # Uvicorn entry
│  ├─ tests/
│  └─ pyproject.toml
├─ docker/             # Dockerfiles, Caddyfile/Nginx, compose
└─ docs/               # README.md, AGENTS.md, API docs
```

### Tech‑Entscheidungen

* **DB**: Standard **SQLite** (robust, ACID, Backups leicht).
  **JSON‑Statefiles**: für sehr leichte Deployments oder read‑heavy Offlineszenarien; mit periodischer Kompaktierung & fsync‑Sorgfalt.
* **PDF**: `reportlab` (reine Python, robust) – optional `weasyprint` für HTML→PDF (benötigt System‑Deps).
* **XLSX**: `xlsxwriter` oder `openpyxl`.
* **CalDAV**: Python‑`caldav`/`icalendar`.
* **Scheduler**: `APScheduler` (BackgroundScheduler) – Jobs: Sync, Aggregation, Export‑Cleanup, JSON‑Kompaktierung.
* **Auth**: Lokalbetrieb ohne Login möglich (nur localhost).
  Optional: **PIN/Passwort**, Basic Auth im Proxy, oder OIDC‑Login.

### Lokale Entwicklung

```bash
# Backend
uvicorn app.main:app --host 127.0.0.1 --port 8080 --reload
# Frontend
pnpm dev --port 5173
```

### Tests & Qualität

* Pytest (Backend), Vitest/Playwright (Frontend).
* Ruff/Black, ESLint/Prettier; pre‑commit Hooks.
* Migrations: Alembic (bei SQLite‑Schemaänderungen).

### Backups & Pflege

* SQLite‑Datei snapshotten (z. B. via `sqlite3 .backup`), Export‑Ordner sichern.
* Für JSON‑Statefiles regelmäßig Kompaktierung & Checksums.

---

## Roadmap (Auszug)

* [ ] PWA‑Mode (Add‑to‑Home‑Screen, Offline‑Cachen der UI)
* [ ] NFC‑Shortcut Generator (Token‑Links als NDEF)
* [ ] Projekterfassung mit Budgets & Auswertungen
* [ ] Mehrbenutzer (lokal) & Rollen
* [ ] Automatische Ruhepausen nach ArbZG‑Regeln (optional)
* [ ] iCal‑Publish der erfassten Arbeitszeiten (read‑only)

---

## Lizenz

TBD (z. B. AGPL‑3.0 oder MIT – je nach Open‑Source‑Strategie).

---

# AGENTS.md

Dieses Dokument beschreibt die **Hintergrund‑Agents/Jobs** von TimeTrack, ihren Zweck, ihre Trigger und Konfigurationsoptionen. Standardmäßig werden sie über **APScheduler** im FastAPI‑Backend betrieben. Für einfache Ein‑Benutzer‑Setups ist keine externe Queue nötig. Optional kann eine Redis‑basierte Distributed‑Queue ergänzt werden.

## Übersicht

| Agent / Job             | Zweck                                                             | Trigger / Intervall                   |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| `SyncAgent:CalDAV`      | Termine aus konfig. CalDAV‑Kalendern abrufen & puffern            | cron: `*/15 * * * *` (konfigurierbar) |
| `ImportAgent:Calendar`  | Vorschlagsliste aktualisieren, Regeln anwenden                    | nach CalDAV‑Sync / on‑demand          |
| `AggregateAgent:Days`   | Tages-/Monatsaggregate (Arbeits-/Pausenzeit, Überstunden)         | alle 5 Min / bei Session‑Änderung     |
| `ExportAgent`           | PDF/XLSX‑Generierung, Signatur, Aufräumen alter Artefakte         | on‑demand + nächtlich Cleanup         |
| `TokenAgent`            | Permalink‑Token auslaufen lassen, Einmal‑Token invalidieren       | minütlich                             |
| `Housekeeping:JSON`     | JSON‑Statefiles kompaktieren & validieren                         | täglich 03:15                         |
| `BackupHint` (optional) | Hinweise/Hook für externes Backup (z. B. sqlite `.backup`)        | täglich 02:30                         |
| `MetricsAgent`          | einfache KPIs schreiben (Sessions/Tag, Exportdauer, Fehlversuche) | alle 10 Min                           |

### 1) SyncAgent:CalDAV

* **Konfig**: `TT_CALDAV_URL`, `TT_CALDAV_USER`, `TT_CALDAV_PASSWORD`, `TT_CALDAV_DEFAULT_CAL`, `TT_CALDAV_SYNC_CRON`.
* **Funktion**: Holt neue/aktualisierte Events (`ETag`, Zeitfenster z. B. ±90 Tage).
* **Sicherheit**: Verbindet nur nach erfolgreicher IP‑/Access‑Prüfung; Credentials verschlüsselt im State (libsodium/fernet).

### 2) ImportAgent:Calendar

* Wendet **Regeln** an (Titel‑Match, Kalender‑Quelle → Tag/Projekt, Standard‑Mapping Dauer→Arbeitszeit).
* Befüllt die *Import‑Inbox*; UI zeigt Auswahl, Anwender bestätigt Übernahme.

### 3) AggregateAgent:Days

* Aktualisiert `day_summaries` nach Session‑Änderungen oder zeitgesteuert.
* Berücksichtigt Pausenregeln & Urlaub/AU‑Überlappungen.

### 4) ExportAgent

* Baut **PDF** (ReportLab/WeasyPrint) und **XLSX** (xlsxwriter/openpyxl).
* Fügt Hash/Signatur hinzu, legt Datei in `TT_EXPORT_DIR` ab, schreibt `exports`‑Metadaten.

### 5) TokenAgent

* Löscht abgelaufene **Permalink‑Tokens**, dreht Einmal‑Tokens nach Nutzung aus dem Verkehr, schreibt Audit‑Eintrag.

### 6) Housekeeping:JSON

* Für `TT_STORAGE=json`: führt periodisch **Kompaktierung** (Merge & Prune) durch, erzeugt SHA‑Checksummen.

### 7) BackupHint (optional)

* Löst Hooks/Webhooks aus, um externe Backup‑Jobs zu triggern (z. B. `sqlite3 /data/timetrack.db ".backup ..."`).

### 8) MetricsAgent

* Schreibt Metriken (z. B. Prometheus‑kompatibel) in `/metrics` (optional).
* Keine personenbezogenen Inhalte; nur Zählwerte/Timing.

---

## Sicherheit & Netz

* **Bind/Allowlist**: IP‑Prüfung in Startroute und Middleware; bei `TT_BEHIND_PROXY=true` nur vertrauenswürdige Proxy‑IPs zulassen.
* **Rate‑Limit**: Standard 60 req/min/IP; anpassbar. Token‑Routen separat limitiert.
* **Header‑Härtung**: CSP, HSTS (über Proxy), X‑Frame‑Options, Referrer‑Policy.
* **Audit‑Pflicht**: Jeder Token‑Call, blockierte IPs, Export‑Erzeugungen.

---

## Beobachtbarkeit

* **Logs**: strukturierte JSON‑Logs (uvicorn + app).
* **Health**: `/healthz` (readiness/liveness), DB/Persistenz‑Check.
* **Metrics**: optional `/metrics` (Prometheus‑Format).

---

## Skalierung

* Single‑Host, Single‑User‑optimiert.
* Für mehrere parallele Nutzer/Agent‑Instanzen:

  * SQLite → WAL‑Modus, ggf. Wechsel auf Postgres (optional später).
  * APScheduler mit Redis Jobstore, Locking pro Job.

---

## API‑Skizze (Auswahl)

```
GET  /healthz
GET  /openapi.json

POST /work/start            # { project?, tags?, comment? }
POST /work/pause            # { comment? }
POST /work/stop             # { comment? }
GET  /a/{token}             # Permalink‑Aktion (GET)

GET  /days?from&to&tag&proj
GET  /calendar/month?yyyy-mm
GET  /leaves?from&to&type
POST /leaves                # Urlaub/AU anlegen

GET  /caldav/preview?from&to
POST /caldav/import         # { event_ids:[], mapping:{...} }

POST /exports               # { type: timesheet|leave|au, range:{...}, format: pdf|xlsx }
GET  /exports/{id}

POST /tokens                # { scope, ttl, ip_bind?, single_use? }
DELETE /tokens/{id}
```

---

## Beispiel‑Caddyfile (optional, mit IP‑Allowlist + TLS)

```caddyfile
# Caddyfile
example.tld {
    encode gzip
    tls you@example.tld

    @allowIPs remote_ip 203.0.113.0/24 198.51.100.42 127.0.0.1
    respond 403 {
        @block not @allowIPs
    }

    handle_path /api* {
        reverse_proxy 127.0.0.1:8080
    }

    handle {
        reverse_proxy 127.0.0.1:5173
    }
}
```

---

*Stand: 11.11.2025 (Europe/Berlin)*
