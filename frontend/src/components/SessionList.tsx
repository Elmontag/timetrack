import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { getSessionsForDay, WorkSession, formatDuration } from '../api'

interface Props {
  refreshKey: string
}

export function SessionList({ refreshKey }: Props) {
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [day, setDay] = useState(dayjs().format('YYYY-MM-DD'))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const run = async () => {
      setLoading(true)
      const data = await getSessionsForDay(day)
      setSessions(data)
      setLoading(false)
    }
    run()
  }, [day, refreshKey])

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Protokoll</h2>
          <p className="text-sm text-slate-400">Alle Einträge des ausgewählten Tages.</p>
        </div>
        <input
          type="date"
          value={day}
          onChange={(event) => setDay(event.target.value)}
          className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
      <div className="mt-3 space-y-2">
        {loading && <p className="text-sm text-slate-400">Lade...</p>}
        {!loading && sessions.length === 0 && <p className="text-sm text-slate-500">Keine Einträge vorhanden.</p>}
        {sessions.map((session) => (
          <div key={session.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
              <span>
                {new Date(session.start_time).toLocaleTimeString()} –{' '}
                {session.stop_time ? new Date(session.stop_time).toLocaleTimeString() : 'laufend'}
              </span>
              <span className="font-mono text-slate-100">{formatDuration(session.total_seconds)}</span>
            </div>
            {session.comment && <p className="mt-1 text-sm text-slate-400">{session.comment}</p>}
            {session.project && <span className="mt-2 inline-block rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-200">{session.project}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
