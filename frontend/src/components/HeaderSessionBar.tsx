import { PauseIcon, PlayIcon, StopIcon } from '@heroicons/react/24/outline'
import dayjs from 'dayjs'
import { useMemo } from 'react'
import { WorkSession } from '../api'
import { useSessionRuntime } from '../hooks/useSessionRuntime'

interface Props {
  activeSession: WorkSession | null
  onStart: () => Promise<void>
  onPauseToggle: () => Promise<void>
  onStop: () => Promise<void>
  loading: {
    start: boolean
    pause: boolean
    stop: boolean
  }
  startPlan: {
    startTime: string
    comment: string
  }
}

export function HeaderSessionBar({ activeSession, onStart, onPauseToggle, onStop, loading, startPlan }: Props) {
  const { runtime, status } = useSessionRuntime(activeSession)
  const isActive = Boolean(activeSession && ['active', 'paused'].includes(activeSession.status))
  const isPaused = activeSession?.status === 'paused'

  const nextStartDescription = useMemo(() => {
    if (!startPlan.startTime) {
      return 'sofort'
    }
    return dayjs(startPlan.startTime).format('DD.MM.YYYY HH:mm [Uhr]')
  }, [startPlan.startTime])

  const plannedComment = startPlan.comment.trim().length > 0 ? startPlan.comment.trim() : null

  const handleClick = async (action: 'start' | 'pause' | 'stop') => {
    try {
      if (action === 'start') {
        await onStart()
      } else if (action === 'pause') {
        await onPauseToggle()
      } else {
        await onStop()
      }
    } catch (error) {
      console.error(error)
    }
  }

  return (
    <div className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-5 py-4 shadow-lg shadow-slate-950/40">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Laufende Arbeitszeit</p>
          <p className="mt-2 font-mono text-4xl font-semibold text-primary">{runtime}</p>
          <p className="mt-1 text-sm text-slate-300">Status: {status}</p>
          <p className="mt-2 text-xs text-slate-500">
            Nächster Start {nextStartDescription}
            {plannedComment && <span className="ml-1 text-slate-400">– „{plannedComment}“</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleClick('start')}
            disabled={isActive || loading.start}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PlayIcon className="h-5 w-5" aria-hidden="true" />
            Start
          </button>
          <button
            type="button"
            onClick={() => handleClick('pause')}
            disabled={!isActive || loading.pause}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPaused ? <PlayIcon className="h-5 w-5" aria-hidden="true" /> : <PauseIcon className="h-5 w-5" aria-hidden="true" />}
            {isPaused ? 'Fortsetzen' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={() => handleClick('stop')}
            disabled={!isActive || loading.stop}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-500/60 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <StopIcon className="h-5 w-5" aria-hidden="true" />
            Stop
          </button>
        </div>
      </div>
    </div>
  )
}
