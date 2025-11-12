import clsx from 'clsx'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { CalDavCalendar, getCaldavCalendars, getSettings, SettingsResponse, updateSettings } from '../api'

const CONTACT_FIELDS = [
  'name',
  'company',
  'department',
  'street',
  'postal_code',
  'city',
  'phone',
  'email',
] as const

type ContactField = (typeof CONTACT_FIELDS)[number]
type ContactFormState = Record<ContactField, string>

const CONTACT_FIELD_META: Record<ContactField, { label: string; placeholder?: string; type?: string }> = {
  name: { label: 'Name', placeholder: 'Max Mustermann' },
  company: { label: 'Firma', placeholder: 'Beispiel GmbH' },
  department: { label: 'Abteilung', placeholder: 'Personalwesen' },
  street: { label: 'Straße', placeholder: 'Musterstraße 1' },
  postal_code: { label: 'PLZ', placeholder: '10115' },
  city: { label: 'Ort', placeholder: 'Berlin' },
  phone: { label: 'Telefon', placeholder: '+49 30 123456' },
  email: { label: 'E-Mail', placeholder: 'ich@example.de', type: 'email' },
}

const LETTER_PLACEHOLDERS: { key: string; description: string }[] = [
  { key: '{today_date}', description: 'Heutiges Datum (TT.MM.JJJJ)' },
  { key: '{trip_title}', description: 'Titel der Dienstreise' },
  { key: '{trip_period}', description: 'Zeitraum, z. B. 12.04.2024 – 15.04.2024' },
  { key: '{trip_destination}', description: 'Zielort der Reise' },
  { key: '{trip_destination_clause}', description: 'Formulierung „nach …“; leer, wenn kein Ziel hinterlegt' },
  { key: '{trip_purpose}', description: 'Reisezweck' },
  { key: '{trip_purpose_clause}', description: 'Formulierung „wegen …“; leer, wenn kein Zweck hinterlegt' },
  { key: '{trip_start_date}', description: 'Startdatum (TT.MM.JJJJ)' },
  { key: '{trip_end_date}', description: 'Enddatum (TT.MM.JJJJ)' },
  { key: '{trip_duration_days}', description: 'Anzahl der Reisetage' },
  { key: '{sender_name}', description: 'Eigener Name (Absender)' },
  { key: '{sender_block}', description: 'Kompletter Absender-Adressblock mit Kontaktdaten' },
  { key: '{hr_name}', description: 'Name der Personalabteilung / Ansprechperson' },
  { key: '{hr_block}', description: 'Adressblock der Personalabteilung' },
]

const createEmptyContact = (): ContactFormState => ({
  name: '',
  company: '',
  department: '',
  street: '',
  postal_code: '',
  city: '',
  phone: '',
  email: '',
})

const normalizeContact = (
  contact: Partial<Record<ContactField, string | null>> | null | undefined,
): ContactFormState => {
  const base = createEmptyContact()
  if (!contact) {
    return base
  }
  const result: ContactFormState = { ...base }
  for (const field of CONTACT_FIELDS) {
    const value = contact[field]
    result[field] = value ? value : ''
  }
  return result
}

const sanitizeContact = (contact: ContactFormState): Record<ContactField, string> => {
  const result: Record<ContactField, string> = {} as Record<ContactField, string>
  for (const field of CONTACT_FIELDS) {
    result[field] = contact[field].trim()
  }
  return result
}

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
  const [dayOverviewRefresh, setDayOverviewRefresh] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null)
  const [availableCalendars, setAvailableCalendars] = useState<CalDavCalendar[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarError, setCalendarError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<'work' | 'calendar' | 'travel' | 'system'>('work')
  const [travelSenderContact, setTravelSenderContact] = useState<ContactFormState>(() => createEmptyContact())
  const [travelHrContact, setTravelHrContact] = useState<ContactFormState>(() => createEmptyContact())
  const [travelLetterSubject, setTravelLetterSubject] = useState('')
  const [travelLetterBody, setTravelLetterBody] = useState('')

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

  const handleSenderContactChange = useCallback((field: ContactField, value: string) => {
    setTravelSenderContact((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleHrContactChange = useCallback((field: ContactField, value: string) => {
    setTravelHrContact((prev) => ({ ...prev, [field]: value }))
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
      setDayOverviewRefresh(data.day_overview_refresh_seconds.toString())
      setTravelSenderContact(normalizeContact(data.travel_sender_contact))
      setTravelHrContact(normalizeContact(data.travel_hr_contact))
      setTravelLetterSubject(data.travel_letter_template.subject)
      setTravelLetterBody(data.travel_letter_template.body)
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
      payload.day_overview_refresh_seconds = dayOverviewRefresh.trim() ? parseInt(dayOverviewRefresh, 10) : null
      payload.travel_sender_contact = sanitizeContact(travelSenderContact)
      payload.travel_hr_contact = sanitizeContact(travelHrContact)
      payload.travel_letter_template = {
        subject: travelLetterSubject.trim(),
        body: travelLetterBody.replace(/\r\n/g, '\n'),
      }
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
      setDayOverviewRefresh(updated.day_overview_refresh_seconds.toString())
      setTravelSenderContact(normalizeContact(updated.travel_sender_contact))
      setTravelHrContact(normalizeContact(updated.travel_hr_contact))
      setTravelLetterSubject(updated.travel_letter_template.subject)
      setTravelLetterBody(updated.travel_letter_template.body)
      if (updated.caldav_url && updated.caldav_user) {
        await loadCalendars()
      }
      setFeedback('success')
      setPasswordUpdate(false)
      setCaldavPassword('')
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent<SettingsResponse>('tt-settings-updated', { detail: updated }))
      }
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

  const sections = [
    {
      id: 'work',
      label: 'Arbeitszeit',
      description: 'Sollzeiten und Urlaubsanspruch verwalten.',
    },
    {
      id: 'calendar',
      label: 'Kalender',
      description: 'CalDAV-Verbindung und Kalenderauswahl.',
    },
    {
      id: 'travel',
      label: 'Dienstreise',
      description: 'Kontaktdaten und Anschreiben-Vorlage pflegen.',
    },
    {
      id: 'system',
      label: 'System',
      description: 'Netzwerk- und technische Einstellungen.',
    },
  ] as const

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/40">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Einstellungen</h2>
          <p className="text-sm text-slate-400">
            Arbeitszeiten, Kalender- und Reisekosten-Einstellungen zentral verwalten.
          </p>
        </div>
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

      <div className="mt-8 grid gap-6 lg:grid-cols-[240px,1fr]">
        <nav className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <ul className="space-y-2">
            {sections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={clsx(
                    'w-full rounded-lg border px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-950',
                    activeSection === section.id
                      ? 'border-primary/60 bg-primary/10 text-primary'
                      : 'border-transparent text-slate-300 hover:border-primary/40 hover:text-primary',
                  )}
                  aria-current={activeSection === section.id ? 'page' : undefined}
                >
                  <div className="font-medium text-slate-100">{section.label}</div>
                  <p className="mt-1 text-xs text-slate-500">{section.description}</p>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className={clsx('space-y-6', activeSection !== 'work' && 'hidden')}>
            <div>
              <h3 className="text-base font-semibold text-slate-200">Sollzeiten &amp; Urlaub</h3>
              <p className="text-xs text-slate-500">Definiere Erwartungswerte für Arbeitszeit und Urlaubsanspruch.</p>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">
                Aktualisierungsintervall Tagesübersicht (Sekunden)
                <input
                  type="number"
                  min="1"
                  max="3600"
                  step="1"
                  value={dayOverviewRefresh}
                  onChange={(event) => setDayOverviewRefresh(event.target.value)}
                  placeholder="z. B. 1"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
            </div>
          </div>

          <div className={clsx('space-y-6', activeSection !== 'calendar' && 'hidden')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-200">CalDAV-Anbindung</h3>
                <p className="text-xs text-slate-500">Zugangsdaten und Kalenderauswahl konfigurieren.</p>
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
              <h4 className="text-sm font-medium text-slate-200">Verfügbare Kalender</h4>
              <p className="mt-1 text-xs text-slate-500">
                Wähle die Kalender, die für den Import berücksichtigt werden sollen.
              </p>
              <div className="mt-3 space-y-2">
                {!credentialsComplete && (
                  <p className="text-sm text-slate-500">Bitte hinterlege URL und Benutzername, um Kalender abzurufen.</p>
                )}
                {credentialsComplete && calendarLoading && <p className="text-sm text-slate-400">Kalender werden geladen…</p>}
                {credentialsComplete && calendarError && (
                  <p className="text-sm text-amber-400">{calendarError}</p>
                )}
                {credentialsComplete && !calendarLoading && !calendarError && availableCalendars.length === 0 && (
                  <p className="text-sm text-slate-500">Keine Kalender verfügbar.</p>
                )}
                {availableCalendars.map((calendar) => (
                  <label
                    key={calendar.id}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 hover:border-primary/70"
                  >
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
          </div>

          <div className={clsx('space-y-6', activeSection !== 'travel' && 'hidden')}>
            <div>
              <h3 className="text-base font-semibold text-slate-200">Dienstreise-Korrespondenz</h3>
              <p className="text-xs text-slate-500">Kontaktdaten und Anschreiben-Vorlage für Reisekosten anpassen.</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <h4 className="text-sm font-semibold text-slate-100">Eigene Kontaktdaten</h4>
                <p className="mt-1 text-xs text-slate-500">Erscheinen im Briefkopf und in entsprechenden Platzhaltern.</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {CONTACT_FIELDS.map((field) => {
                    const meta = CONTACT_FIELD_META[field]
                    return (
                      <label key={`sender-${field}`} className="text-sm text-slate-300">
                        {meta.label}
                        <input
                          type={meta.type ?? 'text'}
                          value={travelSenderContact[field]}
                          onChange={(event) => handleSenderContactChange(field, event.target.value)}
                          placeholder={meta.placeholder}
                          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </label>
                    )
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <h4 className="text-sm font-semibold text-slate-100">Personalabteilung</h4>
                <p className="mt-1 text-xs text-slate-500">Empfängerinformationen für das Anschreiben.</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {CONTACT_FIELDS.map((field) => {
                    const meta = CONTACT_FIELD_META[field]
                    return (
                      <label key={`hr-${field}`} className="text-sm text-slate-300">
                        {meta.label}
                        <input
                          type={meta.type ?? 'text'}
                          value={travelHrContact[field]}
                          onChange={(event) => handleHrContactChange(field, event.target.value)}
                          placeholder={meta.placeholder}
                          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <h4 className="text-sm font-semibold text-slate-100">Anschreiben-Vorlage</h4>
              <p className="mt-1 text-xs text-slate-500">
                Verwende Platzhalter im Format <code className="rounded bg-slate-800/80 px-1">{'{placeholder}'}</code>. Sie werden
                automatisch mit den Reisedaten ersetzt.
              </p>
              <label className="mt-4 block text-sm text-slate-300">
                Betreff-Vorlage
                <input
                  type="text"
                  value={travelLetterSubject}
                  onChange={(event) => setTravelLetterSubject(event.target.value)}
                  placeholder="Reisekostenabrechnung {trip_title}"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <label className="mt-4 block text-sm text-slate-300">
                Text-Vorlage
                <textarea
                  value={travelLetterBody}
                  onChange={(event) => setTravelLetterBody(event.target.value)}
                  rows={10}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <div className="mt-4">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Verfügbare Platzhalter</h5>
                <ul className="mt-2 space-y-1 text-xs text-slate-400">
                  {LETTER_PLACEHOLDERS.map((item) => (
                    <li key={item.key} className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-slate-800/70 px-2 py-0.5 text-[11px] text-primary">{item.key}</code>
                      <span className="text-slate-500">{item.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className={clsx('space-y-6', activeSection !== 'system' && 'hidden')}>
            <div>
              <h3 className="text-base font-semibold text-slate-200">System</h3>
              <p className="text-xs text-slate-500">Netzwerkzugriff über Blocklisten steuern.</p>
            </div>
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
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
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
    </div>
  )
}
