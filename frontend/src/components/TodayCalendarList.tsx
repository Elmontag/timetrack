import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { CalendarEvent, listCalendarEvents } from '../api'

interface Props {
  day: string
  refreshKey: string
}

export function TodayCalendarList({ day, refreshKey }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      try {
        const data = await listCalendarEvents({ from_date: day, to_date: day })
        setEvents(data)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [day, refreshKey])

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
        {!loading && events.length === 0 && (
          <p className="text-sm text-slate-500">Keine Termine für heute.</p>
        )}
        {events.map((event) => (
          <div key={event.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-100">{event.title}</p>
                {event.location && <p className="text-xs text-slate-500">{event.location}</p>}
              </div>
              <span className="rounded-md bg-slate-900 px-3 py-1 font-mono text-xs text-slate-300">
                {dayjs(event.start_time).format('HH:mm')} – {dayjs(event.end_time).format('HH:mm')}
              </span>
            </div>
            {event.description && <p className="mt-2 text-slate-300">{event.description}</p>}
            <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">
              Status: {event.participated ? 'Teilgenommen' : 'Nicht teilgenommen'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
