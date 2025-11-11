import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { WorkSession } from '../api'

export function useSessionRuntime(session: WorkSession | null) {
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
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }, [session, tick])

  const status = useMemo(() => {
    if (!session) {
      return 'Bereit'
    }
    return session.status === 'paused' ? 'Pausiert' : 'Laufend'
  }, [session])

  return { runtime, status }
}
