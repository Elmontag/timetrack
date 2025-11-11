import { PauseIcon, PlayIcon, StopIcon } from '@heroicons/react/24/outline'
import dayjs from 'dayjs'
import { useMemo } from 'react'
import { DaySummary, WorkSession } from '../api'
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
  day: string
  summary: DaySummary | null
}

export function HeaderSessionBar({
  activeSession,
  onStart,
  onPauseToggle,
  onStop,
  loading,
  startPlan,
  day,
  summary,
}: Props) {
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

  const summaryValues = useMemo(() => {
    if (!summary) {
      return {
        workHours: '0,0',
        pauseHours: '0,0',
        targetHours: '0,0',
        overtimeHours: '0,0',
        overtimePositive: false,
      }
    }
    const workHours = (summary.work_seconds / 3600).toFixed(1).replace('.', ',')
    const pauseHours = (summary.pause_seconds / 3600).toFixed(1).replace('.', ',')
    const overtimeHours = (summary.overtime_seconds / 3600).toFixed(1).replace('.', ',')
    const targetSeconds = summary.work_seconds - summary.overtime_seconds
    const targetHours = (targetSeconds / 3600).toFixed(1).replace('.', ',')
    return {
      workHours,
      pauseHours,
      targetHours,
      overtimeHours,
      overtimePositive: summary.overtime_seconds >= 0,
    }
  }, [summary])

  const dayLabel = useMemo(() => dayjs(day).format('DD.MM.YYYY'), [day])
  const lastUpdated = useMemo(() => dayjs().format('HH:mm:ss'), [summary])

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
    <div className="grid gap-4 xl:grid-cols-[1.8fr,1fr]">
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
      <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-5 py-4 shadow-lg shadow-slate-950/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Tagesübersicht</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{dayLabel}</p>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs font-medium text-slate-400">
            Aktualisiert {lastUpdated}
          </span>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <dt className="text-xs uppercase text-slate-400">Arbeit</dt>
            <dd className="text-2xl font-semibold text-slate-100">{summaryValues.workHours} h</dd>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <dt className="text-xs uppercase text-slate-400">Pausen</dt>
            <dd className="text-2xl font-semibold text-slate-100">{summaryValues.pauseHours} h</dd>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <dt className="text-xs uppercase text-slate-400">Soll</dt>
            <dd className="text-2xl font-semibold text-slate-100">{summaryValues.targetHours} h</dd>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <dt className="text-xs uppercase text-slate-400">Saldo</dt>
            <dd className={`text-2xl font-semibold ${summaryValues.overtimePositive ? 'text-emerald-400' : 'text-rose-300'}`}>
              {summaryValues.overtimeHours} h
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
