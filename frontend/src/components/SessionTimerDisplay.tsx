import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { WorkSession } from '../api'

interface Props {
  session: WorkSession | null
}

export function SessionTimerDisplay({ session }: Props) {
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    if (!session || session.status === 'stopped') {
      return
    }
    setTick(Date.now())
    const interval = window.setInterval(() => {
      setTick(Date.now())
    }, 1000)
    return () => window.clearInterval(interval)
  }, [session])

  const runtime = useMemo(() => {
    if (!session || session.status === 'stopped') {
      return '00:00:00'
    }
    const now = dayjs(tick)
    const start = dayjs(session.start_time)
    let pauseSeconds = session.paused_duration || 0
    if (session.status === 'paused' && session.last_pause_start) {
      pauseSeconds += now.diff(dayjs(session.last_pause_start), 'second')
    }
    const elapsed = Math.max(0, now.diff(start, 'second') - pauseSeconds)
    const hours = Math.floor(elapsed / 3600)
    const minutes = Math.floor((elapsed % 3600) / 60)
    const seconds = elapsed % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`
  }, [session, tick])

  const status = session ? (session.status === 'paused' ? 'Pausiert' : 'Laufend') : 'Bereit'

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 text-center shadow-inner">
      <p className="text-xs uppercase tracking-wide text-slate-400">Laufende Arbeitszeit</p>
      <p className="mt-2 font-mono text-4xl font-semibold text-primary">{runtime}</p>
      <p className="mt-1 text-sm text-slate-400">Status: {status}</p>
      {session && session.comment && (
        <p className="mt-2 text-sm text-slate-300">{session.comment}</p>
      )}
    </div>
  )
}
