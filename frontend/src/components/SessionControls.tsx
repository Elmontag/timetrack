import { PlayIcon, PauseIcon, StopIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { pauseSession, startSession, stopSession, WorkSession } from '../api'
import { useAsync } from '../hooks/useAsync'

interface Props {
  activeSession: WorkSession | null
  onUpdate: (session: WorkSession | null) => void
}

const baseButton = 'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50'

export function SessionControls({ activeSession, onUpdate }: Props) {
  const [comment, setComment] = useState('')
  const { run: runStart, loading: startLoading } = useAsync(startSession)
  const { run: runPause, loading: pauseLoading } = useAsync(pauseSession)
  const { run: runStop, loading: stopLoading } = useAsync(stopSession)
  const [tick, setTick] = useState(() => Date.now())

  const isPaused = activeSession?.status === 'paused'
  const isActive = activeSession && ['active', 'paused'].includes(activeSession.status)

  useEffect(() => {
    if (!activeSession || activeSession.status === 'stopped') {
      return
    }
    const interval = window.setInterval(() => {
      setTick(Date.now())
    }, 1000)
    return () => window.clearInterval(interval)
  }, [activeSession])

  const handleStart = async () => {
    const session = await runStart({ comment })
    setComment('')
    onUpdate(session)
  }

  const handlePause = async () => {
    const { session } = await runPause()
    onUpdate(session)
  }

  const handleStop = async () => {
    const session = await runStop({ comment })
    setComment('')
    onUpdate(null)
  }

  const startLabel = useMemo(() => (isActive ? 'Laufende Sitzung' : 'Arbeitszeit starten'), [isActive])

  const runtimeLabel = useMemo(() => {
    if (!activeSession || activeSession.status === 'stopped') {
      return null
    }
    const now = dayjs(tick)
    const start = dayjs(activeSession.start_time)
    let pauseSeconds = activeSession.paused_duration || 0
    if (activeSession.status === 'paused' && activeSession.last_pause_start) {
      pauseSeconds += now.diff(dayjs(activeSession.last_pause_start), 'second')
    }
    const elapsed = Math.max(0, now.diff(start, 'second') - pauseSeconds)
    const hours = Math.floor(elapsed / 3600)
    const minutes = Math.floor((elapsed % 3600) / 60)
    const seconds = elapsed % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`
  }, [activeSession, tick])

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg shadow-slate-900/50">
      <h2 className="text-lg font-semibold text-slate-100">Arbeitszeiterfassung</h2>
      <p className="mt-1 text-sm text-slate-400">Steuere deine aktuelle Arbeitszeit mit einem Klick.</p>
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
        <label className="flex-1 text-sm">
          <span className="text-slate-300">Notiz (optional)</span>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Was machst du gerade?"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            rows={2}
          />
        </label>
        <div className="flex w-full flex-wrap gap-2 md:w-auto">
          <button
            onClick={handleStart}
            disabled={startLoading || isActive}
            className={clsx(baseButton, 'bg-primary text-primary-foreground hover:bg-sky-400/90')}
            aria-label={startLabel}
          >
            <PlayIcon className="h-5 w-5" aria-hidden="true" />
            Start
          </button>
          <button
            onClick={handlePause}
            disabled={!isActive || pauseLoading}
            className={clsx(baseButton, 'bg-slate-800 text-slate-100 hover:bg-slate-700')}
          >
            {isPaused ? <PlayIcon className="h-5 w-5" /> : <PauseIcon className="h-5 w-5" />}
            {isPaused ? 'Fortsetzen' : 'Pause'}
          </button>
          <button
            onClick={handleStop}
            disabled={!isActive || stopLoading}
            className={clsx(baseButton, 'bg-rose-500 text-white hover:bg-rose-400')}
          >
            <StopIcon className="h-5 w-5" />
            Stop
          </button>
        </div>
      </div>
      {activeSession && (
        <p className="mt-3 text-sm text-slate-400">
          Laufend seit <span className="font-medium text-slate-100">{new Date(activeSession.start_time).toLocaleString()}</span>
          {activeSession.comment && <span className="text-slate-500"> – {activeSession.comment}</span>}
          {runtimeLabel && (
            <span className="ml-2 inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 font-mono text-xs text-primary">
              {runtimeLabel}
            </span>
          )}
        </p>
      )}
    </div>
  )
}
