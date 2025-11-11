import dayjs from 'dayjs'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { updateSession, WorkSession } from '../api'
import { useAsync } from '../hooks/useAsync'

interface StartConfig {
  startTime: string
  comment: string
}

interface Props {
  activeSession: WorkSession | null
  startConfig: StartConfig
  onStartConfigChange: (config: StartConfig) => void
  onStart: (override?: { start_time?: string; comment?: string }) => Promise<void>
  onStop: (comment?: string) => Promise<void>
}

export function SessionControls({ activeSession, startConfig, onStartConfigChange, onStart, onStop }: Props) {
  const [activeNote, setActiveNote] = useState('')
  const { run: runUpdate, loading: updatingNote } = useAsync(updateSession)

  useEffect(() => {
    setActiveNote(activeSession?.comment ?? '')
  }, [activeSession?.id, activeSession?.comment])

  const startTimeInput = startConfig.startTime

  const handleStartSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const payload: { start_time?: string; comment?: string } = {}
    if (startTimeInput) {
      payload.start_time = dayjs(startTimeInput).toISOString()
    }
    if (startConfig.comment.trim()) {
      payload.comment = startConfig.comment.trim()
    }
    await onStart(payload)
  }

  const handleStopWithNote = async () => {
    await onStop(activeNote)
  }

  const handleSaveNote = async () => {
    if (!activeSession) return
    await runUpdate(activeSession.id, { comment: activeNote || null })
  }

  const plannedStart = useMemo(() => {
    if (!startTimeInput) return 'Sofort'
    return dayjs(startTimeInput).format('DD.MM.YYYY HH:mm')
  }, [startTimeInput])

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleStartSubmit}
        className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/40"
      >
        <h2 className="text-lg font-semibold text-slate-100">Nächster Arbeitsstart</h2>
        <p className="text-sm text-slate-400">
          Plane Startzeit und Notiz vor. Der Start erfolgt über die Buttons im Header oder über diese Aktion.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-300">
            Startzeit
            <input
              type="datetime-local"
              value={startTimeInput}
              onChange={(event) => onStartConfigChange({ ...startConfig, startTime: event.target.value })}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span className="mt-1 block text-xs text-slate-500">Standard ist die aktuelle Zeit.</span>
          </label>
          <label className="text-sm text-slate-300">
            Notiz zum Start
            <textarea
              value={startConfig.comment}
              onChange={(event) => onStartConfigChange({ ...startConfig, comment: event.target.value })}
              rows={3}
              placeholder="Was steht an?"
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">Geplanter Start: {plannedStart}</p>
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            Start auslösen
          </button>
        </div>
      </form>

      {activeSession && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg shadow-slate-950/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-100">Aktive Sitzung</h3>
              <p className="text-sm text-slate-400">
                Gestartet am {dayjs(activeSession.start_time).format('DD.MM.YYYY HH:mm')} – Status{' '}
                {activeSession.status === 'paused' ? 'Pausiert' : 'Laufend'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleStopWithNote}
              className="inline-flex items-center rounded-md border border-rose-500/60 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20"
            >
              Stop mit Notiz
            </button>
          </div>
          <label className="mt-4 block text-sm text-slate-300">
            Notiz aktualisieren
            <textarea
              value={activeNote}
              onChange={(event) => setActiveNote(event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span className="text-slate-500">
              Hinweis: Pausieren und Fortsetzen findest du oben im Header.
            </span>
            <button
              type="button"
              disabled={updatingNote}
              onClick={handleSaveNote}
              className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-primary hover:text-primary disabled:opacity-60"
            >
              Notiz speichern
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
