import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { WorkSession } from '../api'

interface RuntimeDetails {
  runtime: string
  status: string
  workedSeconds: number
  pausedSeconds: number
}

export function useSessionRuntime(session: WorkSession | null): RuntimeDetails {
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

  return useMemo(() => {
    if (!session) {
      return {
        runtime: '00:00:00',
        status: 'Bereit',
        workedSeconds: 0,
        pausedSeconds: 0,
      }
    }

    const now = dayjs(tick)
    const start = dayjs(session.start_time)
    const totalElapsed = Math.max(0, now.diff(start, 'second'))
    let pausedSeconds = session.paused_duration || 0
    if (session.status === 'paused' && session.last_pause_start) {
      pausedSeconds += Math.max(0, now.diff(dayjs(session.last_pause_start), 'second'))
    }

    const workedSeconds = (() => {
      if (session.status === 'stopped') {
        return session.total_seconds ?? Math.max(0, totalElapsed - pausedSeconds)
      }
      return Math.max(0, totalElapsed - pausedSeconds)
    })()

    const hours = Math.floor(workedSeconds / 3600)
    const minutes = Math.floor((workedSeconds % 3600) / 60)
    const seconds = workedSeconds % 60
    const runtime = `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`

    const status =
      session.status === 'paused' ? 'Pausiert' : session.status === 'stopped' ? 'Beendet' : 'Laufend'

    return {
      runtime,
      status,
      workedSeconds,
      pausedSeconds,
    }
  }, [session, tick])
}
