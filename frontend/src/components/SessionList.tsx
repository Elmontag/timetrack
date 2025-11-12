import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
  WorkSession,
  TimeDisplayFormat,
  getSessionsForDay,
  updateSession,
  deleteSession,
  Task,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
} from '../api'
import { formatSeconds } from '../utils/timeFormat'
import { TaskEditorModal, TaskFormValues } from './TaskEditorModal'

type SessionControl = 'pause' | 'stop' | null

type TaskModalState =
  | { mode: 'create'; initial: TaskFormValues }
  | { mode: 'edit'; task: Task }

interface EditFormState {
  start: string
  end: string
  comment: string
  project: string
  tags: string
}

interface Props {
  refreshKey: string
  timeDisplayFormat: TimeDisplayFormat
  onSessionStart: (options?: { start_time?: string; comment?: string }) => Promise<void>
  onPauseToggle: () => Promise<void>
  onSessionStop: (comment?: string) => Promise<void>
  activeSession: WorkSession | null
}

const emptyTaskForm: TaskFormValues = {
  title: '',
  start: '',
  end: '',
  project: '',
  tags: '',
  note: '',
}

function taskToForm(task: Task): TaskFormValues {
  return {
    title: task.title,
    start: task.start_time ? dayjs(task.start_time).format('HH:mm') : '',
    end: task.end_time ? dayjs(task.end_time).format('HH:mm') : '',
    project: task.project ?? '',
    tags: task.tags.join(', '),
    note: task.note ?? '',
  }
}

function normalizeTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
}

export function SessionList({
  refreshKey,
  timeDisplayFormat,
  onSessionStart,
  onPauseToggle,
  onSessionStop,
  activeSession,
}: Props) {
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [day, setDay] = useState(dayjs().format('YYYY-MM-DD'))
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<EditFormState>({ start: '', end: '', comment: '', project: '', tags: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedNotes, setExpandedNotes] = useState<number[]>([])
  const [expandedSessions, setExpandedSessions] = useState<number[]>([])
  const [taskModalState, setTaskModalState] = useState<TaskModalState | null>(null)
  const [taskModalSubmitting, setTaskModalSubmitting] = useState(false)
  const [taskModalError, setTaskModalError] = useState<string | null>(null)
  const [taskStartLoadingId, setTaskStartLoadingId] = useState<number | null>(null)
  const [sessionControlLoading, setSessionControlLoading] = useState<SessionControl>(null)

  const isToday = dayjs().isSame(dayjs(day), 'day')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [sessionData, taskData] = await Promise.all([getSessionsForDay(day), listTasks(day)])
      setSessions(sessionData)
      setTasks(taskData)
      setExpandedNotes((prev) => prev.filter((id) => sessionData.some((session) => session.id === id)))
      setExpandedSessions((prev) => {
        const visible = sessionData.map((session) => session.id)
        const retained = prev.filter((id) => visible.includes(id))
        const activeId = sessionData.find((session) => session.status !== 'stopped')?.id
        if (activeId && !retained.includes(activeId)) {
          return [...retained, activeId]
        }
        return retained
      })
    } finally {
      setLoading(false)
    }
  }, [day])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  const formatSessionDuration = useCallback(
    (seconds: number | null | undefined) =>
      formatSeconds(seconds ?? 0, timeDisplayFormat, {
        decimalPlaces: timeDisplayFormat === 'decimal' ? 2 : undefined,
        includeUnit: timeDisplayFormat === 'decimal',
      }),
    [timeDisplayFormat],
  )

  const handleDateChange = (value: string) => {
    setDay(value)
    setEditingId(null)
    setError(null)
  }

  const beginEdit = (session: WorkSession) => {
    if (session.status !== 'stopped' || !session.stop_time) {
      return
    }
    setEditingId(session.id)
    setForm({
      start: dayjs(session.start_time).format('YYYY-MM-DDTHH:mm'),
      end: dayjs(session.stop_time).format('YYYY-MM-DDTHH:mm'),
      comment: session.comment ?? '',
      project: session.project ?? '',
      tags: session.tags.join(', '),
    })
    setError(null)
    setExpandedSessions((prev) => (prev.includes(session.id) ? prev : [...prev, session.id]))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setError(null)
  }

  const handleChange = (field: keyof EditFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    if (!editingId) {
      return
    }
    if (!form.start || !form.end) {
      setError('Bitte Start- und Endzeit angeben.')
      return
    }
    const start = dayjs(form.start)
    const end = dayjs(form.end)
    if (!start.isValid() || !end.isValid()) {
      setError('Ungültige Zeitangaben.')
      return
    }
    if (!end.isAfter(start)) {
      setError('Die Endzeit muss nach der Startzeit liegen.')
      return
    }

    const tags = normalizeTags(form.tags)

    setSubmitting(true)
    try {
      await updateSession(editingId, {
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        comment: form.comment.trim() ? form.comment.trim() : null,
        project: form.project.trim() ? form.project.trim() : null,
        tags,
      })
      setEditingId(null)
      setError(null)
      await loadData()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Speichern fehlgeschlagen.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (sessionId: number) => {
    if (!window.confirm('Eintrag wirklich löschen?')) {
      return
    }
    setSubmitting(true)
    try {
      await deleteSession(sessionId)
      if (editingId === sessionId) {
        setEditingId(null)
      }
      await loadData()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Löschen fehlgeschlagen.')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleNotes = (sessionId: number) => {
    setExpandedNotes((prev) =>
      prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId],
    )
  }

  const toggleSession = (sessionId: number) => {
    setExpandedSessions((prev) =>
      prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId],
    )
  }

  const openCreateTask = (initial?: Partial<TaskFormValues>) => {
    setTaskModalError(null)
    setTaskModalState({
      mode: 'create',
      initial: {
        ...emptyTaskForm,
        ...initial,
      },
    })
  }

  const openEditTask = (task: Task) => {
    setTaskModalError(null)
    setTaskModalState({ mode: 'edit', task })
  }

  const closeTaskModal = () => {
    setTaskModalState(null)
    setTaskModalError(null)
  }

  const handleTaskModalSubmit = async (values: TaskFormValues) => {
    if (!taskModalState) {
      return
    }
    const title = values.title.trim()
    if (!title) {
      setTaskModalError('Bitte einen Titel angeben.')
      return
    }

    const startIso = values.start ? dayjs(`${day}T${values.start}`).toISOString() : undefined
    const endIso = values.end ? dayjs(`${day}T${values.end}`).toISOString() : undefined
    const project = values.project.trim() ? values.project.trim() : null
    const note = values.note.trim() ? values.note.trim() : null
    const tags = normalizeTags(values.tags)

    setTaskModalSubmitting(true)
    try {
      if (taskModalState.mode === 'create') {
        await createTask({
          day,
          title,
          start_time: startIso,
          end_time: endIso,
          project,
          tags,
          note,
        })
      } else {
        await updateTask(taskModalState.task.id, {
          day,
          title,
          start_time: values.start ? startIso : null,
          end_time: values.end ? endIso : null,
          project,
          tags,
          note,
        })
      }
      closeTaskModal()
      await loadData()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setTaskModalError(typeof detail === 'string' ? detail : 'Speichern fehlgeschlagen.')
    } finally {
      setTaskModalSubmitting(false)
    }
  }

  const handleTaskDelete = async (task: Task) => {
    if (!window.confirm(`Aufgabe „${task.title}“ wirklich löschen?`)) {
      return
    }
    setTaskStartLoadingId(task.id)
    setError(null)
    try {
      await deleteTask(task.id)
      await loadData()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Aufgabe konnte nicht gelöscht werden.')
    } finally {
      setTaskStartLoadingId(null)
    }
  }

  const handleTaskStart = async (task: Task) => {
    if (activeSession) {
      setError('Es läuft bereits eine Zeiterfassung.')
      return
    }
    if (!isToday) {
      setError('Aufgaben können nur für den aktuellen Tag gestartet werden.')
      return
    }
    setTaskStartLoadingId(task.id)
    setError(null)
    try {
      await onSessionStart({ comment: task.title })
      const nowIso = dayjs().toISOString()
      await updateTask(task.id, { day, start_time: nowIso })
      await loadData()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Starten fehlgeschlagen.')
    } finally {
      setTaskStartLoadingId(null)
    }
  }

  const handlePauseFromSession = async () => {
    if (!activeSession) {
      return
    }
    setSessionControlLoading('pause')
    setError(null)
    try {
      await onPauseToggle()
      await loadData()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Pause/Umschalten fehlgeschlagen.')
    } finally {
      setSessionControlLoading(null)
    }
  }

  const handleStopFromSession = async () => {
    if (!activeSession) {
      return
    }
    setSessionControlLoading('stop')
    setError(null)
    try {
      await onSessionStop()
      await loadData()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Stoppen fehlgeschlagen.')
    } finally {
      setSessionControlLoading(null)
    }
  }

  const tasksBySession = useMemo(() => {
    const mapping = new Map<number, Task[]>()
    const unassigned: Task[] = []
    const sortedSessions = [...sessions].sort((a, b) => dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf())
    tasks.forEach((task) => {
      const start = task.start_time ? dayjs(task.start_time) : null
      const end = task.end_time ? dayjs(task.end_time) : null
      if (!start) {
        unassigned.push(task)
        return
      }
      const match = sortedSessions.find((session) => {
        const sessionStart = dayjs(session.start_time)
        const sessionEnd = session.stop_time ? dayjs(session.stop_time) : null
        const startsBeforeSessionEnds = sessionEnd ? start.isBefore(sessionEnd) : true
        const endsAfterSessionStarts = end ? end.isAfter(sessionStart) : true
        return startsBeforeSessionEnds && endsAfterSessionStarts
      })
      if (match) {
        const current = mapping.get(match.id) ?? []
        current.push(task)
        current.sort((a, b) => {
          const aStart = a.start_time ? dayjs(a.start_time).valueOf() : 0
          const bStart = b.start_time ? dayjs(b.start_time).valueOf() : 0
          return aStart - bStart
        })
        mapping.set(match.id, current)
      } else {
        unassigned.push(task)
      }
    })
    return { mapping, unassigned }
  }, [sessions, tasks])

  const modalInitialValues: TaskFormValues = useMemo(() => {
    if (!taskModalState) {
      return emptyTaskForm
    }
    if (taskModalState.mode === 'edit') {
      return taskToForm(taskModalState.task)
    }
    return taskModalState.initial
  }, [taskModalState])

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Protokoll</h2>
          <p className="text-sm text-slate-400">Arbeitszeiten mit zugehörigen Aufgaben des ausgewählten Tages.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={day}
            onChange={(event) => handleDateChange(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="button"
            onClick={() => openCreateTask()}
            className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400/90"
          >
            Aufgabe ergänzen
          </button>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {error && <p className="text-sm text-rose-400">{error}</p>}
        {loading && <p className="text-sm text-slate-400">Lade...</p>}
        {!loading && sessions.length === 0 && tasks.length === 0 && (
          <p className="text-sm text-slate-500">Keine Einträge vorhanden.</p>
        )}
        {!loading &&
          sessions.map((session) => {
            const isEditing = editingId === session.id
            const notesCount = session.notes ? session.notes.length : 0
            const hasNotes = notesCount > 0
            const notesOpen = expandedNotes.includes(session.id)
            const isExpanded = expandedSessions.includes(session.id)
            const tasksForSession = tasksBySession.mapping.get(session.id) ?? []
            const isActiveSession = activeSession?.id === session.id
            return (
              <div key={session.id} className="rounded-lg border border-slate-800 bg-slate-950/60">
                <button
                  type="button"
                  onClick={() => toggleSession(session.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-slate-300 transition hover:bg-slate-900/70"
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-100">
                      {dayjs(session.start_time).format('HH:mm')} –{' '}
                      {session.stop_time ? dayjs(session.stop_time).format('HH:mm') : 'laufend'}
                    </span>
                    <span className="text-xs text-slate-400">
                      {session.comment ? session.comment : session.project ?? 'Ohne Kommentar'}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-slate-100">{formatSessionDuration(session.total_seconds)}</span>
                    <span className="text-xs text-slate-500">{isExpanded ? '–' : '+'}</span>
                  </span>
                </button>
                {isExpanded && (
                  <div className="space-y-4 border-t border-slate-800 px-4 py-4 text-sm text-slate-200">
                    {isEditing ? (
                      <form onSubmit={handleSave} className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-sm text-slate-300">
                            Startzeit
                            <input
                              type="datetime-local"
                              value={form.start}
                              onChange={(event) => handleChange('start', event.target.value)}
                              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                              required
                            />
                          </label>
                          <label className="text-sm text-slate-300">
                            Endzeit
                            <input
                              type="datetime-local"
                              value={form.end}
                              onChange={(event) => handleChange('end', event.target.value)}
                              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                              required
                            />
                          </label>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-sm text-slate-300">
                            Projekt
                            <input
                              type="text"
                              value={form.project}
                              onChange={(event) => handleChange('project', event.target.value)}
                              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                              placeholder="optional"
                            />
                          </label>
                          <label className="text-sm text-slate-300">
                            Tags (kommagetrennt)
                            <input
                              type="text"
                              value={form.tags}
                              onChange={(event) => handleChange('tags', event.target.value)}
                              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                              placeholder="z. B. Projekt, Meeting"
                            />
                          </label>
                        </div>
                        <label className="block text-sm text-slate-300">
                          Notiz
                          <textarea
                            value={form.comment}
                            onChange={(event) => handleChange('comment', event.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                            rows={2}
                            placeholder="optional"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            disabled={submitting}
                            className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400/90 disabled:opacity-60"
                          >
                            Speichern
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="inline-flex items-center rounded-md border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                            disabled={submitting}
                          >
                            Abbrechen
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="space-y-3">
                        {session.comment && <p className="text-sm text-slate-300">{session.comment}</p>}
                        <div className="flex flex-wrap gap-2 text-xs">
                          {session.project && <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-slate-200">{session.project}</span>}
                          {session.tags.map((tag) => (
                            <span key={tag} className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-slate-200">
                              #{tag}
                            </span>
                          ))}
                        </div>
                        {session.status !== 'stopped' && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={handlePauseFromSession}
                              disabled={sessionControlLoading !== null}
                              className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
                            >
                              {activeSession?.status === 'paused' ? 'Fortsetzen' : 'Pausieren'}
                            </button>
                            <button
                              type="button"
                              onClick={handleStopFromSession}
                              disabled={sessionControlLoading !== null}
                              className="inline-flex items-center rounded-md border border-rose-600 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-600/20 disabled:opacity-60"
                            >
                              Stoppen
                            </button>
                          </div>
                        )}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-200">Aufgaben ({tasksForSession.length})</h3>
                            <button
                              type="button"
                              onClick={() =>
                                openCreateTask({
                                  start: dayjs(session.start_time).format('HH:mm'),
                                  end: session.stop_time ? dayjs(session.stop_time).format('HH:mm') : '',
                                })
                              }
                              className="inline-flex items-center rounded-md border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                            >
                              Neue Aufgabe
                            </button>
                          </div>
                          {tasksForSession.length === 0 && (
                            <p className="text-xs text-slate-500">Keine Aufgaben im Zeitfenster.</p>
                          )}
                          {tasksForSession.map((task) => {
                            const isStarting = taskStartLoadingId === task.id
                            return (
                              <div key={task.id} className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-medium text-slate-100">{task.title}</p>
                                    <p className="text-xs text-slate-400">
                                      {task.start_time ? dayjs(task.start_time).format('HH:mm') : '—'} –{' '}
                                      {task.end_time ? dayjs(task.end_time).format('HH:mm') : '—'}
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {!task.start_time && (
                                      <button
                                        type="button"
                                        onClick={() => handleTaskStart(task)}
                                        disabled={isStarting}
                                        className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-sky-400/90 disabled:opacity-60"
                                      >
                                        Starten
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => openEditTask(task)}
                                      className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                                    >
                                      Bearbeiten
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleTaskDelete(task)}
                                      disabled={isStarting}
                                      className="inline-flex items-center rounded-md border border-rose-600 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-600/20 disabled:opacity-60"
                                    >
                                      Löschen
                                    </button>
                                  </div>
                                </div>
                                {(task.project || task.tags.length > 0 || task.note) && (
                                  <div className="mt-2 space-y-2 text-xs text-slate-300">
                                    {task.project && <div>Projekt: {task.project}</div>}
                                    {task.tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {task.tags.map((tag) => (
                                          <span key={tag} className="rounded-full bg-slate-800 px-2 py-0.5">{tag}</span>
                                        ))}
                                      </div>
                                    )}
                                    {task.note && <p className="text-slate-300">{task.note}</p>}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        {hasNotes && (
                          <div className="rounded-md border border-slate-800 bg-slate-950/60">
                            <button
                              type="button"
                              onClick={() => toggleNotes(session.id)}
                              className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-900/70"
                            >
                              <span>Notizen ({notesCount})</span>
                              <span className="font-mono text-[10px] text-slate-500">{notesOpen ? '−' : '+'}</span>
                            </button>
                            {notesOpen && (
                              <ul className="space-y-2 border-t border-slate-800 px-3 py-2 text-xs text-slate-300">
                                {session.notes?.map((note) => (
                                  <li key={note.id} className="rounded-md border border-slate-800 bg-slate-950/50 p-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-slate-500">
                                      <span>{note.note_type === 'start' ? 'Trackingstart' : 'Sitzung'}</span>
                                      <span>{dayjs(note.created_at).format('DD.MM.YYYY HH:mm')}</span>
                                    </div>
                                    <p className="mt-1 text-sm text-slate-200">{note.content}</p>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                        {session.status === 'stopped' && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => beginEdit(session)}
                              className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                              disabled={submitting}
                            >
                              Bearbeiten
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(session.id)}
                              className="inline-flex items-center rounded-md border border-rose-600 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-600/20"
                              disabled={submitting}
                            >
                              Löschen
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        {!loading && tasksBySession.unassigned.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
            <h3 className="text-sm font-semibold text-slate-200">Aufgaben ohne Zeitfenster</h3>
            <p className="text-xs text-slate-500">Diese Aufgaben konnten keinem Arbeitszeitfenster zugeordnet werden.</p>
            <div className="mt-3 space-y-2">
              {tasksBySession.unassigned.map((task) => {
                const isStarting = taskStartLoadingId === task.id
                return (
                  <div key={task.id} className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-100">{task.title}</p>
                        <p className="text-xs text-slate-400">
                          {task.start_time ? dayjs(task.start_time).format('HH:mm') : '—'} –{' '}
                          {task.end_time ? dayjs(task.end_time).format('HH:mm') : '—'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!task.start_time && (
                          <button
                            type="button"
                            onClick={() => handleTaskStart(task)}
                            disabled={isStarting}
                            className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-sky-400/90 disabled:opacity-60"
                          >
                            Starten
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditTask(task)}
                          className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                        >
                          Bearbeiten
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTaskDelete(task)}
                          disabled={isStarting}
                          className="inline-flex items-center rounded-md border border-rose-600 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-600/20 disabled:opacity-60"
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                    {(task.project || task.tags.length > 0 || task.note) && (
                      <div className="mt-2 space-y-2 text-xs text-slate-300">
                        {task.project && <div>Projekt: {task.project}</div>}
                        {task.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {task.tags.map((tag) => (
                              <span key={tag} className="rounded-full bg-slate-800 px-2 py-0.5">{tag}</span>
                            ))}
                          </div>
                        )}
                        {task.note && <p className="text-slate-300">{task.note}</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <TaskEditorModal
        open={taskModalState !== null}
        day={day}
        title={taskModalState?.mode === 'edit' ? 'Aufgabe bearbeiten' : 'Aufgabe anlegen'}
        initialValues={modalInitialValues}
        submitting={taskModalSubmitting}
        error={taskModalError}
        onClose={closeTaskModal}
        onSubmit={handleTaskModalSubmit}
      />
    </div>
  )
}
