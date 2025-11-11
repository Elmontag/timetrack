import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { CalDavCalendar, getCaldavCalendars, getSettings, SettingsResponse, updateSettings } from '../api'

export function SettingsPanel() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [blockIps, setBlockIps] = useState('')
  const [caldavUrl, setCaldavUrl] = useState('')
  const [caldavUser, setCaldavUser] = useState('')
  const [caldavSelection, setCaldavSelection] = useState<string[]>([])
  const [passwordUpdate, setPasswordUpdate] = useState(false)
  const [caldavPassword, setCaldavPassword] = useState('')
  const [expectedDaily, setExpectedDaily] = useState('')
  const [expectedWeekly, setExpectedWeekly] = useState('')
  const [vacationPerYear, setVacationPerYear] = useState('')
  const [vacationCarryover, setVacationCarryover] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null)
  const [availableCalendars, setAvailableCalendars] = useState<CalDavCalendar[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState<string | null>(null)

  const loadCalendars = useCallback(async () => {
    setCalendarLoading(true)
    setCalendarError(null)
    try {
      const calendars = await getCaldavCalendars()
      setAvailableCalendars(calendars)
    } catch (error) {
      console.error(error)
      setCalendarError('Kalender konnten nicht geladen werden.')
    } finally {
      setCalendarLoading(false)
    }
  }, [])

  useEffect(() => {
    const run = async () => {
      const data = await getSettings()
      setSettings(data)
      setBlockIps(data.block_ips.join(', '))
      setCaldavUrl(data.caldav_url ?? '')
      setCaldavUser(data.caldav_user ?? '')
      setCaldavSelection(data.caldav_selected_calendars)
      setExpectedDaily(data.expected_daily_hours?.toString() ?? '')
      setExpectedWeekly(data.expected_weekly_hours?.toString() ?? '')
      setVacationPerYear(data.vacation_days_per_year.toString())
      setVacationCarryover(data.vacation_days_carryover.toString())
      if (data.caldav_url && data.caldav_user) {
        await loadCalendars()
      } else {
        setAvailableCalendars([])
      }
    }
    run()
  }, [loadCalendars])

  const credentialsComplete = useMemo(
    () => caldavUrl.trim().length > 0 && caldavUser.trim().length > 0,
    [caldavUrl, caldavUser],
  )

  if (!settings) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-sm text-slate-400">
        Lade Einstellungen…
      </div>
    )
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      const payload: Record<string, unknown> = {
        block_ips: blockIps.split(',').map((entry) => entry.trim()).filter(Boolean),
        caldav_url: caldavUrl || null,
        caldav_user: caldavUser || null,
        caldav_selected_calendars: caldavSelection,
        caldav_default_cal: caldavSelection[0] ?? null,
      }
      payload.expected_daily_hours = expectedDaily.trim() ? parseFloat(expectedDaily) : null
      payload.expected_weekly_hours = expectedWeekly.trim() ? parseFloat(expectedWeekly) : null
      payload.vacation_days_per_year = vacationPerYear.trim() ? parseFloat(vacationPerYear) : null
      payload.vacation_days_carryover = vacationCarryover.trim() ? parseFloat(vacationCarryover) : null
      if (passwordUpdate) {
        payload.caldav_password = caldavPassword || null
      }
      const updated = await updateSettings(payload)
      setSettings(updated)
      setBlockIps(updated.block_ips.join(', '))
      setExpectedDaily(updated.expected_daily_hours?.toString() ?? '')
      setExpectedWeekly(updated.expected_weekly_hours?.toString() ?? '')
      setVacationPerYear(updated.vacation_days_per_year.toString())
      setVacationCarryover(updated.vacation_days_carryover.toString())
      setCaldavSelection(updated.caldav_selected_calendars)
      if (updated.caldav_url && updated.caldav_user) {
        await loadCalendars()
      }
      setFeedback('success')
      setPasswordUpdate(false)
      setCaldavPassword('')
    } catch (error) {
      console.error(error)
      setFeedback('error')
    } finally {
      setSaving(false)
    }
  }

  const toggleCalendar = (calendarId: string) => {
    setCaldavSelection((prev) =>
      prev.includes(calendarId) ? prev.filter((entry) => entry !== calendarId) : [...prev, calendarId],
    )
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/40">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Einstellungen</h2>
          <p className="text-sm text-slate-400">
            Infrastruktur, Sollstunden und CalDAV-Verbindungen zentral verwalten.
          </p>
        </div>
        <button
          type="button"
          onClick={loadCalendars}
          disabled={!credentialsComplete || calendarLoading}
          className="inline-flex items-center rounded-md border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          CalDAV-Kalender aktualisieren
        </button>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <dt className="text-slate-500">Umgebung</dt>
          <dd className="mt-1 font-medium text-slate-100">{settings.environment}</dd>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <dt className="text-slate-500">Zeitzone</dt>
          <dd className="mt-1 font-medium text-slate-100">{settings.timezone}</dd>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <dt className="text-slate-500">Sollstunden pro Tag</dt>
          <dd className="mt-1 font-medium text-slate-100">{settings.expected_daily_hours ?? '–'} h</dd>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <dt className="text-slate-500">Sollstunden pro Woche</dt>
          <dd className="mt-1 font-medium text-slate-100">{settings.expected_weekly_hours ?? '–'} h</dd>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
          <dt className="text-slate-500">Urlaubstage (inkl. Übertrag)</dt>
          <dd className="mt-1 font-medium text-slate-100">
            {(settings.vacation_days_per_year + settings.vacation_days_carryover).toFixed(1)} Tage
          </dd>
        </div>
      </dl>

      <form onSubmit={handleSubmit} className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          <div>
            <label className="text-sm text-slate-300">
              IP-Blocklist
              <textarea
                value={blockIps}
                onChange={(event) => setBlockIps(event.target.value)}
                rows={4}
                placeholder="z. B. 127.0.0.1, 192.168.0.0/24"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Kommagetrennt, unterstützt IPs und CIDR-Bereiche. Alle anderen Adressen bleiben zugelassen.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-300">
              Sollstunden pro Tag
              <input
                type="number"
                min="0"
                step="0.25"
                value={expectedDaily}
                onChange={(event) => setExpectedDaily(event.target.value)}
                placeholder="z. B. 8"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="text-sm text-slate-300">
              Sollstunden pro Woche
              <input
                type="number"
                min="0"
                step="0.5"
                value={expectedWeekly}
                onChange={(event) => setExpectedWeekly(event.target.value)}
                placeholder="z. B. 40"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="text-sm text-slate-300">
              Urlaubstage pro Jahr
              <input
                type="number"
                min="0"
                step="0.5"
                value={vacationPerYear}
                onChange={(event) => setVacationPerYear(event.target.value)}
                placeholder="z. B. 30"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="text-sm text-slate-300">
              Übertrag aus Vorjahr
              <input
                type="number"
                min="0"
                step="0.5"
                value={vacationCarryover}
                onChange={(event) => setVacationCarryover(event.target.value)}
                placeholder="z. B. 2.5"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>
        </section>

        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-slate-300">
              CalDAV URL
              <input
                type="url"
                value={caldavUrl}
                onChange={(event) => setCaldavUrl(event.target.value)}
                placeholder="https://…"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="text-sm text-slate-300">
              Benutzername
              <input
                type="text"
                value={caldavUser}
                onChange={(event) => setCaldavUser(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <h3 className="text-sm font-medium text-slate-200">Verfügbare Kalender</h3>
            <p className="mt-1 text-xs text-slate-500">
              Wähle die Kalender, die für den Import berücksichtigt werden sollen.
            </p>
            <div className="mt-3 space-y-2">
              {!credentialsComplete && (
                <p className="text-sm text-slate-500">
                  Bitte hinterlege URL und Benutzername, um Kalender abzurufen.
                </p>
              )}
              {credentialsComplete && calendarLoading && (
                <p className="text-sm text-slate-400">Kalender werden geladen…</p>
              )}
              {credentialsComplete && calendarError && (
                <p className="text-sm text-amber-400">{calendarError}</p>
              )}
              {credentialsComplete && !calendarLoading && !calendarError && availableCalendars.length === 0 && (
                <p className="text-sm text-slate-500">Keine Kalender verfügbar.</p>
              )}
              {availableCalendars.map((calendar) => (
                <label key={calendar.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 hover:border-primary/70">
                  <div>
                    <span className="font-medium text-slate-100">{calendar.name}</span>
                    <p className="text-xs text-slate-500">{calendar.id}</p>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border border-slate-600 text-primary focus:ring-primary"
                    checked={caldavSelection.includes(calendar.id)}
                    onChange={() => toggleCalendar(calendar.id)}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
            <label className="flex items-center gap-2 text-slate-200">
              <input
                type="checkbox"
                checked={passwordUpdate}
                onChange={(event) => setPasswordUpdate(event.target.checked)}
                className="h-4 w-4 rounded border border-slate-700 bg-slate-950 text-primary focus:ring-primary"
              />
              CalDAV-Passwort aktualisieren
            </label>
            {passwordUpdate ? (
              <input
                type="password"
                value={caldavPassword}
                onChange={(event) => setCaldavPassword(event.target.value)}
                className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Neues Passwort"
              />
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                {settings.caldav_password_set ? 'Passwort gesetzt' : 'Kein Passwort hinterlegt'} – aktivieren, um zu ändern.
              </p>
            )}
          </div>
        </section>

        <div className="lg:col-span-2 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm">
          <div>
            {feedback === 'success' && <span className="text-emerald-400">Änderungen gespeichert.</span>}
            {feedback === 'error' && <span className="text-rose-400">Speichern fehlgeschlagen.</span>}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50"
          >
            Änderungen speichern
          </button>
        </div>
      </form>
    </div>
  )
}
