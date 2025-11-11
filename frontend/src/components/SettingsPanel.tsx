import { FormEvent, useEffect, useState } from 'react'
import { getSettings, SettingsResponse, updateSettings } from '../api'

export function SettingsPanel() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [blockIps, setBlockIps] = useState('')
  const [caldavUrl, setCaldavUrl] = useState('')
  const [caldavUser, setCaldavUser] = useState('')
  const [caldavDefaultCal, setCaldavDefaultCal] = useState('')
  const [passwordUpdate, setPasswordUpdate] = useState(false)
  const [caldavPassword, setCaldavPassword] = useState('')
  const [expectedDaily, setExpectedDaily] = useState('')
  const [expectedWeekly, setExpectedWeekly] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null)

  useEffect(() => {
    const run = async () => {
      const data = await getSettings()
      setSettings(data)
      setBlockIps(data.block_ips.join(', '))
      setCaldavUrl(data.caldav_url ?? '')
      setCaldavUser(data.caldav_user ?? '')
      setCaldavDefaultCal(data.caldav_default_cal ?? '')
      setExpectedDaily(data.expected_daily_hours?.toString() ?? '')
      setExpectedWeekly(data.expected_weekly_hours?.toString() ?? '')
    }
    run()
  }, [])

  if (!settings) {
    return <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">Lade Einstellungen…</div>
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
        caldav_default_cal: caldavDefaultCal || null,
      }
      payload.expected_daily_hours = expectedDaily.trim() ? parseFloat(expectedDaily) : null
      payload.expected_weekly_hours = expectedWeekly.trim() ? parseFloat(expectedWeekly) : null
      if (passwordUpdate) {
        payload.caldav_password = caldavPassword || null
      }
      const updated = await updateSettings(payload)
      setSettings(updated)
      setBlockIps(updated.block_ips.join(', '))
      setExpectedDaily(updated.expected_daily_hours?.toString() ?? '')
      setExpectedWeekly(updated.expected_weekly_hours?.toString() ?? '')
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

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <h2 className="text-lg font-semibold text-slate-100">Einstellungen</h2>
      <p className="text-sm text-slate-400">IP-Blocklist und CalDAV-Verbindung zentral verwalten.</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
          <dt className="font-medium text-slate-100">Umgebung</dt>
          <dd>{settings.environment}</dd>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
          <dt className="font-medium text-slate-100">Zeitzone</dt>
          <dd>{settings.timezone}</dd>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
          <dt className="font-medium text-slate-100">Sollstunden pro Tag</dt>
          <dd>{settings.expected_daily_hours ?? '–'} h</dd>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
          <dt className="font-medium text-slate-100">Sollstunden pro Woche</dt>
          <dd>{settings.expected_weekly_hours ?? '–'} h</dd>
        </div>
      </dl>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="text-sm text-slate-300">
            IP-Blocklist
            <textarea
              value={blockIps}
              onChange={(event) => setBlockIps(event.target.value)}
              rows={3}
              placeholder="z. B. 127.0.0.1, 192.168.0.0/24"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">Kommagetrennt, unterstützt IPs und CIDR-Bereiche. Alle anderen Adressen bleiben zugelassen.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-300">
            Sollstunden pro Tag
            <input
              type="number"
              min="0"
              step="0.25"
              value={expectedDaily}
              onChange={(event) => setExpectedDaily(event.target.value)}
              placeholder="z. B. 8"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
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
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-300">
            CalDAV URL
            <input
              type="url"
              value={caldavUrl}
              onChange={(event) => setCaldavUrl(event.target.value)}
              placeholder="https://…"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-sm text-slate-300">
            Benutzername
            <input
              type="text"
              value={caldavUser}
              onChange={(event) => setCaldavUser(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-sm text-slate-300">
            Standard-Kalender
            <input
              type="text"
              value={caldavDefaultCal}
              onChange={(event) => setCaldavDefaultCal(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-300">
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
                className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Neues Passwort"
              />
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                {settings.caldav_password_set ? 'Passwort gesetzt' : 'Kein Passwort hinterlegt'} – aktivieren, um zu ändern.
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm">
            {feedback === 'success' && <span className="text-emerald-400">Gespeichert.</span>}
            {feedback === 'error' && <span className="text-rose-400">Speichern fehlgeschlagen.</span>}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50"
          >
            Änderungen speichern
          </button>
        </div>
      </form>
    </div>
  )
}
