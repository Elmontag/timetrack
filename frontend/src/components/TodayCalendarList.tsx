import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import { CalendarEvent, listCalendarEvents, updateCalendarParticipation } from '../api'

interface Props {
  day: string
  refreshKey: string
}

export function TodayCalendarList({ day, refreshKey }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number[]>([])
  const [participationUpdating, setParticipationUpdating] = useState<number | null>(null)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listCalendarEvents({ from_date: day, to_date: day })
      setEvents(data)
    } catch (err) {
      console.error('Kalender konnte nicht geladen werden', err)
      setEvents([])
      setError('Kalenderdaten konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [day])

  useEffect(() => {
    loadEvents()
  }, [loadEvents, refreshKey])

  useEffect(() => {
    setExpanded((prev) => prev.filter((id) => events.some((event) => event.id === id)))
  }, [events])

  const toggleDetails = (eventId: number) => {
    setExpanded((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId],
    )
  }

  const handleParticipationToggle = async (eventId: number, participated: boolean) => {
    setParticipationUpdating(eventId)
    setError(null)
    try {
      await updateCalendarParticipation(eventId, participated)
      await loadEvents()
    } catch (err) {
      console.error('Teilnahmestatus konnte nicht gespeichert werden', err)
      setError('Teilnahmestatus konnte nicht aktualisiert werden.')
    } finally {
      setParticipationUpdating(null)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Kalendereinträge heute</h2>
          <p className="text-sm text-slate-400">Importierte Termine des Tages und Teilnahme-Status.</p>
        </div>
        <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs font-medium text-slate-300">
          {dayjs(day).format('DD.MM.')}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        {loading && <p className="text-sm text-slate-400">Lade Termine…</p>}
        {error && !loading && <p className="text-sm text-rose-300">{error}</p>}
        {!loading && events.length === 0 && (
          <p className="text-sm text-slate-500">Keine Termine für heute.</p>
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
                  <span className={event.participated ? 'text-emerald-400' : 'text-slate-400'}>
                    {event.participated ? 'Teilgenommen' : 'Nicht teilgenommen'}
                  </span>
                </span>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                  <button
                    type="button"
                    onClick={() => handleParticipationToggle(event.id, !event.participated)}
                    disabled={participationUpdating === event.id}
                    className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {event.participated ? 'auf Nicht' : 'als Teilgenommen'}
                  </button>
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
