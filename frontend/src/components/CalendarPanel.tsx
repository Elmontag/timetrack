import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarEvent, createCalendarEvent, listCalendarEvents, updateCalendarEvent } from '../api'

dayjs.extend(isoWeek)

interface Props {
  refreshKey: string
}

type ViewMode = 'day' | 'week' | 'month' | 'year'

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: 'Offen', className: 'bg-slate-900/60 text-slate-200' },
  attended: { label: 'Teilgenommen', className: 'bg-emerald-500/10 text-emerald-300' },
  absent: { label: 'Nicht teilgenommen', className: 'bg-amber-500/10 text-amber-300' },
  cancelled: { label: 'Hinfällig', className: 'bg-rose-500/10 text-rose-300' },
}

const STATUS_OPTIONS: { value: 'pending' | 'attended' | 'absent' | 'cancelled'; label: string }[] = [
  { value: 'pending', label: STATUS_STYLES.pending.label },
  { value: 'attended', label: STATUS_STYLES.attended.label },
  { value: 'absent', label: STATUS_STYLES.absent.label },
  { value: 'cancelled', label: STATUS_STYLES.cancelled.label },
]

const VIEW_OPTIONS: { key: ViewMode; label: string }[] = [
  { key: 'day', label: 'Tag' },
  { key: 'week', label: 'Woche' },
  { key: 'month', label: 'Monat' },
  { key: 'year', label: 'Jahr' },
]

export function CalendarPanel({ refreshKey }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [range, setRange] = useState({
    from: dayjs().startOf('month').format('YYYY-MM-DD'),
    to: dayjs().endOf('month').format('YYYY-MM-DD'),
  })
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [pivotDate, setPivotDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    start_time: dayjs().format('YYYY-MM-DDTHH:mm'),
    end_time: dayjs().add(1, 'hour').format('YYYY-MM-DDTHH:mm'),
    location: '',
    description: '',
    status: 'pending',
  })
  const [submitting, setSubmitting] = useState(false)
  const [expandedRows, setExpandedRows] = useState<number[]>([])
  const [participationUpdating, setParticipationUpdating] = useState<number | null>(null)
  const formattedRange = useMemo(
    () => `${dayjs(range.from).format('DD.MM.YYYY')} – ${dayjs(range.to).format('DD.MM.YYYY')}`,
    [range.from, range.to],
  )

  useEffect(() => {
    const pivot = dayjs(pivotDate)
    if (!pivot.isValid()) {
      return
    }
    let start = pivot
    let end = pivot
    switch (viewMode) {
      case 'day':
        start = pivot.startOf('day')
        end = pivot.endOf('day')
        break
      case 'week':
        start = pivot.startOf('week')
        end = pivot.endOf('week')
        break
      case 'month':
        start = pivot.startOf('month')
        end = pivot.endOf('month')
        break
      case 'year':
        start = pivot.startOf('year')
        end = pivot.endOf('year')
        break
      default:
        break
    }
    const nextRange = {
      from: start.format('YYYY-MM-DD'),
      to: end.format('YYYY-MM-DD'),
    }
    setRange((prev) => (prev.from === nextRange.from && prev.to === nextRange.to ? prev : nextRange))
  }, [pivotDate, viewMode])

  const navigateRange = (direction: -1 | 1) => {
    const pivot = dayjs(pivotDate)
    if (!pivot.isValid()) {
      setPivotDate(dayjs().format('YYYY-MM-DD'))
      return
    }
    let next = pivot
    switch (viewMode) {
      case 'day':
        next = pivot.add(direction, 'day')
        break
      case 'week':
        next = pivot.add(direction, 'week')
        break
      case 'month':
        next = pivot.add(direction, 'month')
        break
      case 'year':
        next = pivot.add(direction, 'year')
        break
      default:
        break
    }
    setPivotDate(next.format('YYYY-MM-DD'))
  }

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listCalendarEvents({ from_date: range.from, to_date: range.to })
      setEvents(data)
    } catch (err) {
      console.error('Kalender konnte nicht geladen werden', err)
      setEvents([])
      setError('Kalenderdaten konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    loadEvents()
  }, [loadEvents, refreshKey])

  useEffect(() => {
    setExpandedRows((prev) => prev.filter((id) => events.some((event) => event.id === id)))
  }, [events])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      await createCalendarEvent({
        title: form.title,
        start_time: form.start_time,
        end_time: form.end_time,
        location: form.location || undefined,
        description: form.description || undefined,
        status: form.status,
        participated: form.status === 'attended',
      })
      await loadEvents()
      setForm((prev) => ({
        ...prev,
        title: '',
        description: '',
        status: 'pending',
      }))
    } finally {
      setSubmitting(false)
    }
  }

  const updateStatus = async (
    eventId: number,
    status: 'pending' | 'attended' | 'absent' | 'cancelled',
  ) => {
    setParticipationUpdating(eventId)
    setError(null)
    try {
      await updateCalendarEvent(eventId, { status })
      await loadEvents()
    } catch (err) {
      console.error('Kalenderstatus konnte nicht gespeichert werden', err)
      setError('Kalenderstatus konnte nicht aktualisiert werden.')
    } finally {
      setParticipationUpdating(null)
    }
  }

  const toggleDetails = (eventId: number) => {
    setExpandedRows((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId],
    )
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Kalenderübersicht</h2>
          <p className="text-sm text-slate-400">
            Umschaltbare Tages-, Wochen-, Monats- oder Jahresansicht und direkte Statuspflege für Termine.
          </p>
          <p className="mt-1 text-xs text-slate-500">Zeitraum: {formattedRange}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-md border border-slate-800">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setViewMode(option.key)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === option.key
                    ? 'bg-primary text-slate-950'
                    : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigateRange(-1)}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
            >
              ←
            </button>
            <input
              type="date"
              value={pivotDate}
              onChange={(event) => setPivotDate(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="button"
              onClick={() => navigateRange(1)}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
            >
              →
            </button>
          </div>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-6">
        <label className="text-sm text-slate-300 md:col-span-2">
          Titel
          <input
            type="text"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            required
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="text-sm text-slate-300 md:col-span-2">
          Beginn
          <input
            type="datetime-local"
            value={form.start_time}
            onChange={(event) => setForm((prev) => ({ ...prev, start_time: event.target.value }))}
            required
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="text-sm text-slate-300 md:col-span-2">
          Ende
          <input
            type="datetime-local"
            value={form.end_time}
            onChange={(event) => setForm((prev) => ({ ...prev, end_time: event.target.value }))}
            required
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="text-sm text-slate-300 md:col-span-3">
          Ort
          <input
            type="text"
            value={form.location}
            onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
            placeholder="optional"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="text-sm text-slate-300 md:col-span-3">
          Beschreibung
          <input
            type="text"
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="optional"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="text-sm text-slate-300 md:col-span-3">
          Status
          <select
            value={form.status}
            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="md:col-span-6 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50"
          >
            Termin speichern
          </button>
        </div>
      </form>
      <div className="mt-6 max-h-80 overflow-y-auto rounded-xl border border-slate-800">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2 text-left">Termin</th>
              <th className="px-4 py-2 text-left">Zeitraum</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-center text-sm text-slate-400">
                  Lade Termine…
                </td>
              </tr>
            )}
            {error && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-center text-sm text-rose-300">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error &&
              events.map((event) => {
                const isExpanded = expandedRows.includes(event.id)
                return (
                  <Fragment key={event.id}>
                    <tr className="hover:bg-slate-900/70">
                      <td className="px-4 py-2 text-slate-100">
                        <div className="font-medium">{event.title}</div>
                      </td>
                      <td className="px-4 py-2 text-slate-200">
                        {new Date(event.start_time).toLocaleString()} – {new Date(event.end_time).toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col gap-2">
                          <span
                            className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              STATUS_STYLES[event.status]?.className ?? STATUS_STYLES.pending.className
                            }`}
                          >
                            {STATUS_STYLES[event.status]?.label ?? STATUS_STYLES.pending.label}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => updateStatus(event.id, 'attended')}
                              disabled={participationUpdating === event.id}
                              className={`rounded-md border px-2 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                event.status === 'attended'
                                  ? 'border-emerald-400 text-emerald-300'
                                  : 'border-slate-700 text-slate-200 hover:border-primary hover:text-primary'
                              }`}
                            >
                              Teilgenommen
                            </button>
                            <button
                              type="button"
                              onClick={() => updateStatus(event.id, 'absent')}
                              disabled={participationUpdating === event.id}
                              className={`rounded-md border px-2 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                event.status === 'absent'
                                  ? 'border-amber-400 text-amber-300'
                                  : 'border-slate-700 text-slate-200 hover:border-primary hover:text-primary'
                              }`}
                            >
                              Nicht teilgenommen
                            </button>
                            <button
                              type="button"
                              onClick={() => updateStatus(event.id, 'cancelled')}
                              disabled={participationUpdating === event.id}
                              className={`rounded-md border px-2 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                event.status === 'cancelled'
                                  ? 'border-rose-400 text-rose-300'
                                  : 'border-slate-700 text-slate-200 hover:border-primary hover:text-primary'
                              }`}
                            >
                              Hinfällig
                            </button>
                            {event.status !== 'pending' && (
                              <button
                                type="button"
                                onClick={() => updateStatus(event.id, 'pending')}
                                disabled={participationUpdating === event.id}
                                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Zurücksetzen
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          onClick={() => toggleDetails(event.id)}
                          className="text-xs text-primary hover:underline"
                        >
                          {isExpanded ? 'Details verbergen' : 'Details anzeigen'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${event.id}-details`} className="bg-slate-900/50">
                        <td colSpan={4} className="px-4 py-3 text-sm text-slate-200">
                          <div className="space-y-3">
                            {event.description && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-slate-500">Beschreibung</p>
                                <p className="text-slate-300">{event.description}</p>
                              </div>
                            )}
                            {event.location && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-slate-500">Ort</p>
                                <p className="text-slate-300">{event.location}</p>
                              </div>
                            )}
                            {event.attendees.length > 0 && (
                              <div>
                                <p className="text-xs uppercase tracking-wide text-slate-500">Teilnehmer</p>
                                <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-300">
                                  {event.attendees.map((attendee) => (
                                    <li key={attendee}>{attendee}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {!event.description && !event.location && event.attendees.length === 0 && (
                              <p className="text-xs text-slate-500">Keine zusätzlichen Details vorhanden.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            {!loading && !error && events.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-center text-sm text-slate-400">
                  Keine Termine im Zeitraum.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
