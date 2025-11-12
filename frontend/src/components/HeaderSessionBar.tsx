import { PauseIcon, PlayIcon, StopIcon } from '@heroicons/react/24/outline'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { DaySummary, TimeDisplayFormat, WorkSession } from '../api'
import { useSessionRuntime } from '../hooks/useSessionRuntime'
import { Modal } from './Modal'
import { formatSeconds } from '../utils/timeFormat'

interface Props {
  activeSession: WorkSession | null
  onStart: () => Promise<void>
  onPauseToggle: () => Promise<void>
  onStop: (comment?: string) => Promise<void>
  loading: {
    start: boolean
    pause: boolean
    stop: boolean
  }
  startPlan: {
    startTime: string
    comment: string
    noteTimestamp: string | null
  }
  onStartPlanChange: (plan: { startTime: string; comment: string; noteTimestamp: string | null }) => void
  day: string
  summary: DaySummary | null
  onRuntimeNoteCreate: (content: string, createdAt: string) => Promise<void>
  timeDisplayFormat: TimeDisplayFormat
}

export function HeaderSessionBar({
  activeSession,
  onStart,
  onPauseToggle,
  onStop,
  loading,
  startPlan,
  onStartPlanChange,
  day,
  summary,
  onRuntimeNoteCreate,
  timeDisplayFormat,
}: Props) {
  const { runtime, status, workedSeconds, pausedSeconds } = useSessionRuntime(activeSession)
  const isActive = Boolean(activeSession && ['active', 'paused'].includes(activeSession.status))
  const isPaused = activeSession?.status === 'paused'
  const [noteMode, setNoteMode] = useState<'start' | 'runtime'>('start')
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [noteTimestamp, setNoteTimestamp] = useState(dayjs().format('YYYY-MM-DDTHH:mm'))
  const [noteError, setNoteError] = useState<string | null>(null)
  const [savingNote, setSavingNote] = useState(false)

  const nextStartDescription = useMemo(() => {
    if (!startPlan.startTime) {
      return 'sofort'
    }
    return dayjs(startPlan.startTime).format('DD.MM.YYYY HH:mm [Uhr]')
  }, [startPlan.startTime])

  const plannedNoteSummary = useMemo(() => {
    if (!startPlan.comment.trim()) {
      return null
    }
    const timestamp = startPlan.noteTimestamp
      ? dayjs(startPlan.noteTimestamp).format('DD.MM.YYYY HH:mm')
      : null
    return { text: startPlan.comment.trim(), timestamp }
  }, [startPlan.comment, startPlan.noteTimestamp])

  const summaryValues = useMemo(() => {
    const baseWork = summary?.work_seconds ?? 0
    const basePause = summary?.pause_seconds ?? 0
    const expectedSeconds = summary?.expected_seconds ?? 0
    const vacationSeconds = summary?.vacation_seconds ?? 0

    let workTotal = baseWork
    let pauseTotal = basePause

    if (
      activeSession &&
      ['active', 'paused'].includes(activeSession.status) &&
      dayjs(activeSession.start_time).format('YYYY-MM-DD') === day
    ) {
      workTotal += workedSeconds
      pauseTotal += pausedSeconds
    }

    const overtimeSeconds = workTotal + vacationSeconds - expectedSeconds
    const targetSeconds = expectedSeconds - vacationSeconds

    const decimalPlaces = timeDisplayFormat === 'decimal' ? 1 : undefined
    const includeUnit = timeDisplayFormat === 'decimal'

    return {
      workHours: formatSeconds(workTotal, timeDisplayFormat, {
        decimalPlaces,
        includeUnit,
      }),
      pauseHours: formatSeconds(pauseTotal, timeDisplayFormat, {
        decimalPlaces,
        includeUnit,
      }),
      targetHours: formatSeconds(targetSeconds, timeDisplayFormat, {
        decimalPlaces,
        includeUnit,
      }),
      overtimeHours: formatSeconds(overtimeSeconds, timeDisplayFormat, {
        decimalPlaces,
        includeUnit,
      }),
      overtimePositive: overtimeSeconds >= 0,
    }
  }, [
    summary,
    activeSession,
    day,
    workedSeconds,
    pausedSeconds,
    timeDisplayFormat,
  ])

  const dayLabel = useMemo(() => dayjs(day).format('DD.MM.YYYY'), [day])
  const lastUpdated = dayjs().format('HH:mm:ss')

  const sessionNotes = useMemo(() => activeSession?.notes ?? [], [activeSession?.notes])
  const startSessionNote = useMemo(
    () => sessionNotes.find((note) => note.note_type === 'start') ?? null,
    [sessionNotes],
  )
  const runtimeNotes = useMemo(
    () => sessionNotes.filter((note) => note.note_type !== 'start'),
    [sessionNotes],
  )
  const latestRuntimeNote = runtimeNotes.length > 0 ? runtimeNotes[runtimeNotes.length - 1] : null

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

  const closeNoteModal = () => {
    setNoteModalOpen(false)
    setSavingNote(false)
    setNoteError(null)
  }

  const openStartNoteModal = () => {
    setNoteMode('start')
    setNoteDraft(startPlan.comment)
    const base = startPlan.noteTimestamp
      ? dayjs(startPlan.noteTimestamp).format('YYYY-MM-DDTHH:mm')
      : dayjs().format('YYYY-MM-DDTHH:mm')
    setNoteTimestamp(base)
    setNoteError(null)
    setSavingNote(false)
    setNoteModalOpen(true)
  }

  const openRuntimeNoteModal = () => {
    setNoteMode('runtime')
    setNoteDraft('')
    setNoteTimestamp(dayjs().format('YYYY-MM-DDTHH:mm'))
    setNoteError(null)
    setSavingNote(false)
    setNoteModalOpen(true)
  }

  const handleNoteSave = async () => {
    const trimmed = noteDraft.trim()
    if (!trimmed) {
      setNoteError('Bitte eine Notiz eingeben.')
      return
    }
    const parsed = dayjs(noteTimestamp)
    const iso = parsed.isValid() ? parsed.toISOString() : dayjs().toISOString()
    if (noteMode === 'start') {
      onStartPlanChange({ ...startPlan, comment: trimmed, noteTimestamp: iso })
      closeNoteModal()
      return
    }
    if (!activeSession) {
      setNoteError('Keine aktive Sitzung aktiv.')
      return
    }
    setSavingNote(true)
    try {
      await onRuntimeNoteCreate(trimmed, iso)
      closeNoteModal()
    } catch (error) {
      console.error(error)
      setNoteError('Notiz konnte nicht gespeichert werden.')
    } finally {
      setSavingNote(false)
    }
  }

  const handleStartNoteRemove = () => {
    onStartPlanChange({ ...startPlan, comment: '', noteTimestamp: null })
    closeNoteModal()
    setNoteDraft('')
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.8fr,1fr]">
      <div className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-5 py-4 shadow-lg shadow-slate-950/40">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Laufende Arbeitszeit</p>
            <p className="mt-2 font-mono text-4xl font-semibold text-primary">{runtime}</p>
            <p className="mt-1 text-sm text-slate-300">Status: {status}</p>
            {!isActive && (
              <p className="mt-2 text-xs text-slate-500">
                Nächster Start {nextStartDescription}
              </p>
            )}
            {isActive && activeSession && (
              <p className="mt-2 text-xs text-slate-500">
                Gestartet am {dayjs(activeSession.start_time).format('DD.MM.YYYY HH:mm')} – Status{' '}
                {activeSession.status === 'paused' ? 'Pausiert' : 'Laufend'}
              </p>
            )}
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
        {!isActive && (
          <div className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <label className="text-sm text-slate-300">
                Geplanter Arbeitsstart
                <input
                  type="datetime-local"
                  value={startPlan.startTime}
                  onChange={(event) =>
                    onStartPlanChange({ ...startPlan, startTime: event.target.value })
                  }
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <span className="mt-1 block text-xs text-slate-500">Standard ist die aktuelle Zeit.</span>
              </label>
              <div className="flex flex-col items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Startnotiz
                </span>
                <button
                  type="button"
                  onClick={openStartNoteModal}
                  className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-primary hover:text-primary"
                >
                  Neue Notiz
                </button>
                {plannedNoteSummary && (
                  <p className="max-w-[260px] truncate text-left text-[11px] text-slate-400">
                    {plannedNoteSummary.timestamp
                      ? `Zuletzt ${plannedNoteSummary.timestamp}`
                      : 'Ohne Zeitangabe'}{' '}
                    – „{plannedNoteSummary.text}“
                  </p>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Plane Startzeit und optionale Notiz vor. Der Start erfolgt über die Buttons oben oder per Permalink.
            </p>
          </div>
        )}
        {isActive && (
          <div className="mt-6 flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openRuntimeNoteModal}
                className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-primary hover:text-primary"
              >
                Neue Notiz
              </button>
              {latestRuntimeNote && (
                <span className="max-w-[280px] truncate text-[11px] text-slate-400">
                  Letzte Notiz {dayjs(latestRuntimeNote.created_at).format('DD.MM.YYYY HH:mm')} – „
                  {latestRuntimeNote.content}“
                </span>
              )}
            </div>
            {startSessionNote && (
              <span className="max-w-[280px] truncate text-[11px] text-slate-500">
                Startnotiz {dayjs(startSessionNote.created_at).format('DD.MM.YYYY HH:mm')} – „
                {startSessionNote.content}“
              </span>
            )}
          </div>
        )}
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
            <dd className="text-2xl font-semibold text-slate-100">{summaryValues.workHours}</dd>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <dt className="text-xs uppercase text-slate-400">Pausen</dt>
            <dd className="text-2xl font-semibold text-slate-100">{summaryValues.pauseHours}</dd>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <dt className="text-xs uppercase text-slate-400">Soll</dt>
            <dd className="text-2xl font-semibold text-slate-100">{summaryValues.targetHours}</dd>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <dt className="text-xs uppercase text-slate-400">Saldo</dt>
            <dd className={`text-2xl font-semibold ${summaryValues.overtimePositive ? 'text-emerald-400' : 'text-rose-300'}`}>
              {summaryValues.overtimeHours}
            </dd>
          </div>
        </dl>
      </div>
      <Modal
        open={noteModalOpen}
        onClose={closeNoteModal}
        title={noteMode === 'start' ? 'Notiz für den Trackingstart' : 'Notiz zur laufenden Sitzung'}
      >
        <div className="space-y-4">
          <label className="block text-sm text-slate-300">
            Zeitpunkt
            <input
              type="datetime-local"
              value={noteTimestamp}
              onChange={(event) => setNoteTimestamp(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Notiz
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              rows={4}
              placeholder={
                noteMode === 'start'
                  ? 'Planung zum Start festhalten'
                  : 'Ereignis während der Sitzung notieren'
              }
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          {noteError && <p className="text-sm text-rose-300">{noteError}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleNoteSave}
              disabled={savingNote}
              className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-slate-950 shadow hover:bg-sky-400/90 disabled:opacity-60"
            >
              Speichern
            </button>
            <button
              type="button"
              onClick={closeNoteModal}
              className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              Abbrechen
            </button>
            {noteMode === 'start' && startPlan.comment && (
              <button
                type="button"
                onClick={handleStartNoteRemove}
                className="inline-flex items-center rounded-md border border-rose-600 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-600/20"
              >
                Startnotiz entfernen
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}
