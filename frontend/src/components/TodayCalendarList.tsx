import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { CalendarEvent, listCalendarEvents, updateCalendarEvent } from '../api'

interface Props {
  day: string
  refreshKey: string
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: 'Offen', className: 'text-slate-400' },
  attended: { label: 'Teilgenommen', className: 'text-emerald-400' },
  absent: { label: 'Nicht teilgenommen', className: 'text-amber-300' },
  cancelled: { label: 'Hinfällig', className: 'text-rose-300' },
}

export function TodayCalendarList({ day, refreshKey }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number[]>([])
  const [participationUpdating, setParticipationUpdating] = useState<number | null>(null)
  const [selectedDay, setSelectedDay] = useState(day)
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    setSelectedDay(day)
  }, [day])

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listCalendarEvents({
        from_date: selectedDay,
        to_date: selectedDay,
      })
      setEvents(data)
    } catch (err) {
      console.error('Kalender konnte nicht geladen werden', err)
      setEvents([])
      setError('Kalenderdaten konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [selectedDay])

  useEffect(() => {
    loadEvents()
  }, [loadEvents, refreshKey])

  useEffect(() => {
    setExpanded((prev) => prev.filter((id) => events.some((event) => event.id === id)))
  }, [events])

  useEffect(() => {
    setExpanded([])
    setError(null)
  }, [selectedDay])

  const changeDay = (offset: number) => {
    setSelectedDay((prev) => dayjs(prev).add(offset, 'day').format('YYYY-MM-DD'))
  }

  const toggleCollapse = () =>
    setIsCollapsed((prev) => {
      const next = !prev
      if (next) {
        setExpanded([])
      }
      return next
    })

  const isToday = selectedDay === dayjs().format('YYYY-MM-DD')

  const toggleDetails = (eventId: number) => {
    setExpanded((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId],
    )
  }

  const handleStatusChange = async (
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

  if (isCollapsed) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex items-start justify-end gap-2">
          <div className="group relative">
            <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-300">
              {dayjs(selectedDay).format('dd, DD.MM.YYYY')}
            </span>
            <span className="pointer-events-none absolute right-1/2 top-full z-10 mt-1 w-max translate-x-1/2 rounded-lg bg-slate-950/90 px-3 py-1 text-xs font-semibold text-slate-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
              Heutige Termine
            </span>
          </div>
          <button
            type="button"
            onClick={toggleCollapse}
            aria-expanded={!isCollapsed}
            aria-label="Termine anzeigen"
            className="rounded-full border border-slate-700 bg-slate-950/70 p-1 text-slate-300 transition hover:border-primary hover:text-primary"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M8 5l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            {isToday ? 'Heutige Termine' : `Termine am ${dayjs(selectedDay).format('DD.MM.YYYY')}`}
          </h2>
          <p className="text-sm text-slate-400">Importierte Termine und Teilnahme-Status.</p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => changeDay(-1)}
            className="rounded-full border border-slate-700 bg-slate-950/70 p-1 text-slate-300 transition hover:border-primary hover:text-primary"
            aria-label="Vorheriger Tag"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12.5 5l-5 5 5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-300">
            {dayjs(selectedDay).format('dd, DD.MM.YYYY')}
          </span>
          <button
            type="button"
            onClick={() => changeDay(1)}
            className="rounded-full border border-slate-700 bg-slate-950/70 p-1 text-slate-300 transition hover:border-primary hover:text-primary"
            aria-label="Nächster Tag"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M7.5 5l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={toggleCollapse}
            aria-expanded={!isCollapsed}
            aria-label="Termine verbergen"
            className="rounded-full border border-slate-700 bg-slate-950/70 p-1 text-slate-300 transition hover:border-primary hover:text-primary"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 5l-5 5 5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {loading && <p className="text-sm text-slate-400">Lade Termine…</p>}
        {error && !loading && <p className="text-sm text-rose-300">{error}</p>}
        {!loading && events.length === 0 && (
          <p className="text-sm text-slate-500">Keine Termine für diesen Tag.</p>
        )}
        {events.map((event) => {
          const isExpanded = expanded.includes(event.id)
          return (
            <div key={event.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-slate-100">{event.title}</p>
                </div>
                <span className="rounded-md bg-slate-900 px-3 py-1 font-mono text-xs text-slate-300">
                  {dayjs(event.start_time).format('HH:mm')} – {dayjs(event.end_time).format('HH:mm')}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs uppercase tracking-wide text-slate-500">
                <span>
                  Status:{' '}
                  <span
                    className={
                      STATUS_STYLES[event.status]?.className ?? STATUS_STYLES.pending.className
                    }
                  >
                    {STATUS_STYLES[event.status]?.label ?? STATUS_STYLES.pending.label}
                  </span>
                </span>
                <span className="text-[11px] lowercase text-slate-500">
                  {event.calendar_identifier && event.calendar_identifier !== 'manual'
                    ? `CalDAV: ${event.calendar_identifier}`
                    : 'Lokal'}
                </span>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                  <button
                    type="button"
                    onClick={() => handleStatusChange(event.id, 'attended')}
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
                    onClick={() => handleStatusChange(event.id, 'absent')}
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
                    onClick={() => handleStatusChange(event.id, 'cancelled')}
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
                      onClick={() => handleStatusChange(event.id, 'pending')}
                      disabled={participationUpdating === event.id}
                      className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Zurücksetzen
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleDetails(event.id)}
                    className="text-xs text-primary hover:underline"
                  >
                    {isExpanded ? 'Details verbergen' : 'Details anzeigen'}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="mt-3 space-y-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
                  {event.description && (
                    <div>
                      <p className="font-medium uppercase tracking-wide text-slate-500">Beschreibung</p>
                      <p className="mt-1 text-slate-200">{event.description}</p>
                    </div>
                  )}
                  {event.location && (
                    <div>
                      <p className="font-medium uppercase tracking-wide text-slate-500">Ort</p>
                      <p className="mt-1 text-slate-200">{event.location}</p>
                    </div>
                  )}
                  {event.attendees.length > 0 && (
                    <div>
                      <p className="font-medium uppercase tracking-wide text-slate-500">Teilnehmer</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-200">
                        {event.attendees.map((attendee) => (
                          <li key={attendee}>{attendee}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="font-medium uppercase tracking-wide text-slate-500">Quelle</p>
                    <p className="mt-1 text-slate-200">
                      {event.calendar_identifier && event.calendar_identifier !== 'manual'
                        ? `CalDAV (${event.calendar_identifier})`
                        : 'Lokal'}
                    </p>
                  </div>
                  {!event.description && !event.location && event.attendees.length === 0 && (
                    <p className="text-slate-500">Keine zusätzlichen Details vorhanden.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
