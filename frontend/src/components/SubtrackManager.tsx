import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  WorkSession,
  Subtrack,
  createSubtrack,
  updateSubtrack,
  deleteSubtrack,
  getSessionsForDay,
  TimeDisplayFormat,
} from '../api'
import { formatSeconds } from '../utils/timeFormat'
import { Modal } from './Modal'

interface Props {
  day: string
  refreshKey?: string
  activeSession: WorkSession | null
  onChange: () => void
  timeDisplayFormat: TimeDisplayFormat
}

type LightboxContext =
  | { type: 'start'; sessionId: number }
  | { type: 'add' }
  | { type: 'edit'; subtrack: Subtrack }

interface SubtrackFormState {
  title: string
  sessionId: number | ''
  startTime: string
  endTime: string
  project: string
  tags: string
  note: string
}

const EMPTY_FORM: SubtrackFormState = {
  title: '',
  sessionId: '',
  startTime: '',
  endTime: '',
  project: '',
  tags: '',
  note: '',
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return '—'
  }
  return dayjs(value).format('HH:mm')
}

function sessionLabel(session: WorkSession) {
  const start = dayjs(session.start_time).format('HH:mm')
  const end = session.stop_time ? dayjs(session.stop_time).format('HH:mm') : 'läuft'
  return `${start} – ${end}${session.project ? ` · ${session.project}` : ''}`
}

export function SubtrackManager({ day, refreshKey, activeSession, onChange, timeDisplayFormat }: Props) {
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [modalContext, setModalContext] = useState<LightboxContext | null>(null)
  const [formState, setFormState] = useState<SubtrackFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getSessionsForDay(day)
      setSessions(data)
    } catch (err) {
      console.error(err)
      setError('Protokoll konnte nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [day])

  useEffect(() => {
    loadSessions()
  }, [loadSessions, refreshKey])

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev)
      sessions.forEach((session) => {
        if (!next.has(session.id)) {
          next.add(session.id)
        }
      })
      return next
    })
  }, [sessions])

  const activeSessionId = activeSession?.id ?? null
  const activeSessionData = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  )
  const activeSubtrack = useMemo(
    () => activeSessionData?.subtracks?.find((entry) => entry.end_time === null) ?? null,
    [activeSessionData],
  )

  const toggleSession = (sessionId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      return next
    })
  }

  const handleStartOrStop = () => {
    if (activeSubtrack) {
      handleStopActiveSubtrack()
      return
    }
    if (activeSessionId) {
      openCreateModal({ type: 'start', sessionId: activeSessionId })
    }
  }

  const closeModal = () => {
    setModalContext(null)
    setFormState(EMPTY_FORM)
    setFormError(null)
  }

  const openCreateModal = (context: LightboxContext) => {
    setActionError(null)
    setModalContext(context)
    setFormError(null)
    if (context.type === 'start') {
      setFormState({
        title: '',
        sessionId: context.sessionId,
        startTime: dayjs().format('HH:mm:ss'),
        endTime: '',
        project: activeSession?.project ?? '',
        tags: activeSession?.tags?.join(', ') ?? '',
        note: '',
      })
      return
    }
    if (context.type === 'edit') {
      const subtrack = context.subtrack
      setFormState({
        title: subtrack.title,
        sessionId: subtrack.session_id ?? '',
        startTime: subtrack.start_time ? dayjs(subtrack.start_time).format('HH:mm:ss') : '',
        endTime: subtrack.end_time ? dayjs(subtrack.end_time).format('HH:mm:ss') : '',
        project: subtrack.project ?? '',
        tags: subtrack.tags.join(', '),
        note: subtrack.note ?? '',
      })
      return
    }
    setFormState({
      ...EMPTY_FORM,
      sessionId: activeSessionId ?? '',
    })
  }

  const handleModalSubmit = async () => {
    if (!modalContext) {
      return
    }
    const title = formState.title.trim()
    if (!title) {
      setFormError('Bitte einen Titel angeben.')
      return
    }
    const sessionId = formState.sessionId
    if (sessionId === '' || Number.isNaN(Number(sessionId))) {
      setFormError('Bitte einen Track auswählen.')
      return
    }
    if (!formState.startTime) {
      setFormError('Bitte eine Startzeit auswählen.')
      return
    }
    const tags = formState.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
    const buildTimestamp = (value: string) => dayjs(`${day}T${value}`).format('YYYY-MM-DDTHH:mm:ss')
    const startIso = buildTimestamp(formState.startTime)
    const endIso = formState.endTime ? buildTimestamp(formState.endTime) : null

    setSubmitting(true)
    setFormError(null)
    try {
      if (modalContext.type === 'edit') {
        const payload: Parameters<typeof updateSubtrack>[1] = {
          title,
          session_id: typeof sessionId === 'number' ? sessionId : Number(sessionId),
          start_time: startIso,
          end_time: endIso,
          project: formState.project.trim() ? formState.project.trim() : null,
          tags,
          note: formState.note.trim() ? formState.note.trim() : null,
        }
        await updateSubtrack(modalContext.subtrack.id, payload)
      } else {
        const payload: Parameters<typeof createSubtrack>[0] = {
          day,
          title,
          session_id: typeof sessionId === 'number' ? sessionId : Number(sessionId),
          start_time: startIso,
          project: formState.project.trim() ? formState.project.trim() : undefined,
          tags,
          note: formState.note.trim() ? formState.note.trim() : undefined,
        }
        if (endIso) {
          payload.end_time = endIso
        }
        await createSubtrack(payload)
      }
      closeModal()
      onChange()
      await loadSessions()
    } catch (err: any) {
      console.error(err)
      const detail = err?.response?.data?.detail
      setFormError(typeof detail === 'string' ? detail : 'Subtrack konnte nicht gespeichert werden.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStopActiveSubtrack = async () => {
    if (!activeSubtrack) {
      return
    }
    setActionLoading(true)
    setActionError(null)
    try {
      await updateSubtrack(activeSubtrack.id, {
        end_time: dayjs().format('YYYY-MM-DDTHH:mm:ss'),
      })
      onChange()
      await loadSessions()
    } catch (err: any) {
      console.error(err)
      const detail = err?.response?.data?.detail
      setActionError(typeof detail === 'string' ? detail : 'Aktiver Subtrack konnte nicht gestoppt werden.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (entry: Subtrack) => {
    if (!window.confirm(`Subtrack „${entry.title}“ wirklich löschen?`)) {
      return
    }
    setActionLoading(true)
    setActionError(null)
    try {
      await deleteSubtrack(entry.id)
      onChange()
      await loadSessions()
    } catch (err: any) {
      console.error(err)
      const detail = err?.response?.data?.detail
      setActionError(typeof detail === 'string' ? detail : 'Subtrack konnte nicht gelöscht werden.')
    } finally {
      setActionLoading(false)
    }
  }

  const durationLabel = useCallback(
    (seconds: number | null | undefined) =>
      formatSeconds(seconds ?? 0, timeDisplayFormat, {
        decimalPlaces: timeDisplayFormat === 'decimal' ? 2 : undefined,
        includeUnit: timeDisplayFormat === 'decimal',
      }),
    [timeDisplayFormat],
  )

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Protokoll &amp; Subtracks</h2>
          <p className="text-sm text-slate-400">Übersicht aller Tracks des Tages inklusive zugehöriger Subtracks.</p>
        </div>
        <span className="text-xs uppercase tracking-wide text-slate-500">{day}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleStartOrStop}
          disabled={(!activeSessionId && !activeSubtrack) || submitting || actionLoading}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 disabled:opacity-50"
        >
          {activeSubtrack ? 'Subtrack stoppen' : 'Subtrack starten'}
        </button>
        <button
          type="button"
          onClick={() => openCreateModal({ type: 'add' })}
          className="inline-flex items-center rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
          disabled={submitting || actionLoading}
        >
          Subtrack ergänzen
        </button>
        {actionError && <span className="text-sm text-rose-400">{actionError}</span>}
      </div>
      <div className="mt-4 space-y-3">
        {loading && <p className="text-sm text-slate-400">Lade Protokoll…</p>}
        {error && <p className="rounded-md border border-rose-700/60 bg-rose-600/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        {!loading && !error && sessions.length === 0 && (
          <p className="text-sm text-slate-500">Noch keine Tracks für diesen Tag vorhanden.</p>
        )}
        {!loading && !error &&
          sessions.map((session) => {
            const isExpanded = expanded.has(session.id)
            const durationSeconds =
              typeof session.total_seconds === 'number'
                ? session.total_seconds
                : session.stop_time
                ? dayjs(session.stop_time).diff(dayjs(session.start_time), 'second')
                : 0
            const hasActiveSubtrack = session.subtracks.some((item) => item.end_time === null)
            return (
              <div
                key={session.id}
                className={`rounded-lg border border-slate-800 bg-slate-950/60 p-3 ${
                  hasActiveSubtrack ? 'border-sky-500/40' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleSession(session.id)}
                      className="text-left text-sm font-semibold text-slate-100 hover:text-primary"
                    >
                      {dayjs(session.start_time).format('HH:mm')} –{' '}
                      {session.stop_time ? dayjs(session.stop_time).format('HH:mm') : 'läuft'}
                    </button>
                    <div className="text-xs text-slate-400">
                      Dauer: {durationLabel(durationSeconds)} · Status: {session.status}
                    </div>
                    {session.project && <div className="mt-1 text-xs text-primary">Projekt: {session.project}</div>}
                    {session.comment && <div className="mt-1 text-sm text-slate-300">{session.comment}</div>}
                    {session.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {session.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    ID {session.id}
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-3 space-y-2">
                    {session.subtracks.length === 0 && (
                      <p className="text-sm text-slate-500">Keine Subtracks für diesen Track.</p>
                    )}
                    {session.subtracks.map((subtrack) => {
                      const isActive = subtrack.end_time === null
                      return (
                        <div
                          key={subtrack.id}
                          className={`rounded-md border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm ${
                            isActive ? 'border-sky-500/60 bg-sky-500/5' : ''
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-medium text-slate-100">{subtrack.title}</div>
                            <div className="font-mono text-xs text-slate-400">
                              {formatTimestamp(subtrack.start_time)} –{' '}
                              {subtrack.end_time ? formatTimestamp(subtrack.end_time) : 'läuft'}
                            </div>
                          </div>
                          {subtrack.project && <div className="text-xs text-primary">Projekt: {subtrack.project}</div>}
                          {subtrack.tags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {subtrack.tags.map((tag) => (
                                <span key={tag} className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {subtrack.note && <p className="mt-1 text-slate-300">{subtrack.note}</p>}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openCreateModal({ type: 'edit', subtrack })}
                              className="rounded-md border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                              disabled={actionLoading}
                            >
                              Bearbeiten
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(subtrack)}
                              className="rounded-md border border-rose-600 px-3 py-1 text-xs font-semibold text-rose-300 transition hover:bg-rose-600/20"
                              disabled={actionLoading}
                            >
                              Löschen
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
      </div>
      <Modal
        open={modalContext !== null}
        onClose={closeModal}
        title={modalContext?.type === 'edit' ? 'Subtrack bearbeiten' : 'Subtrack anlegen'}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault()
            handleModalSubmit()
          }}
          className="space-y-3"
        >
          <label className="block text-sm text-slate-300">
            Titel
            <input
              type="text"
              value={formState.title}
              onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
              required
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Haupttrack
            <select
              value={formState.sessionId === '' ? '' : formState.sessionId}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  sessionId: event.target.value === '' ? '' : Number(event.target.value),
                }))
              }
              disabled={modalContext?.type === 'start'}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">Bitte auswählen…</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {sessionLabel(session)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-300">
              Start
              <input
                type="time"
                value={formState.startTime}
                onChange={(event) => setFormState((prev) => ({ ...prev, startTime: event.target.value }))}
                required
                step={1}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="text-sm text-slate-300">
              Ende
              <input
                type="time"
                value={formState.endTime}
                onChange={(event) => setFormState((prev) => ({ ...prev, endTime: event.target.value }))}
                step={1}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>
          <label className="block text-sm text-slate-300">
            Projekt (optional)
            <input
              type="text"
              value={formState.project}
              onChange={(event) => setFormState((prev) => ({ ...prev, project: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Tags (kommagetrennt)
            <input
              type="text"
              value={formState.tags}
              onChange={(event) => setFormState((prev) => ({ ...prev, tags: event.target.value }))}
              placeholder="z. B. Meeting, Kunden"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="block text-sm text-slate-300">
            Notiz
            <textarea
              value={formState.note}
              onChange={(event) => setFormState((prev) => ({ ...prev, note: event.target.value }))}
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          {formError && <p className="text-sm text-rose-400">{formError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
              disabled={submitting}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 disabled:opacity-50"
              disabled={submitting}
            >
              Speichern
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
