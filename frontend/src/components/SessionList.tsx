import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import dayjs from 'dayjs'
import { deleteSession, getSessionsForDay, updateSession, WorkSession, formatDuration } from '../api'

interface Props {
  refreshKey: string
}

interface EditFormState {
  start: string
  end: string
  comment: string
  project: string
  tags: string
}

export function SessionList({ refreshKey }: Props) {
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [day, setDay] = useState(dayjs().format('YYYY-MM-DD'))
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<EditFormState>({ start: '', end: '', comment: '', project: '', tags: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getSessionsForDay(day)
      setSessions(data)
    } finally {
      setLoading(false)
    }
  }, [day])

  useEffect(() => {
    loadSessions()
  }, [loadSessions, refreshKey])

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

    const tags = form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)

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
      await loadSessions()
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
      await loadSessions()
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'Löschen fehlgeschlagen.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Protokoll</h2>
          <p className="text-sm text-slate-400">Alle Einträge des ausgewählten Tages.</p>
        </div>
        <input
          type="date"
          value={day}
          onChange={(event) => {
            setDay(event.target.value)
            setEditingId(null)
            setError(null)
          }}
          className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
      <div className="mt-3 space-y-2">
        {loading && <p className="text-sm text-slate-400">Lade...</p>}
        {!loading && sessions.length === 0 && <p className="text-sm text-slate-500">Keine Einträge vorhanden.</p>}
        {error && (
          <p className="text-sm text-rose-400">
            {error}
          </p>
        )}
        {sessions.map((session) => {
          const isEditing = editingId === session.id
          return (
            <div key={session.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
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
                        placeholder="z.B. Projekt, Meeting"
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
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-300">
                    <span>
                      {dayjs(session.start_time).format('HH:mm')} –{' '}
                      {session.stop_time ? dayjs(session.stop_time).format('HH:mm') : 'laufend'}
                    </span>
                    <span className="font-mono text-slate-100">{formatDuration(session.total_seconds)}</span>
                  </div>
                  {session.comment && <p className="text-sm text-slate-400">{session.comment}</p>}
                  <div className="flex flex-wrap gap-2">
                    {session.project && <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-200">{session.project}</span>}
                    {session.tags.map((tag) => (
                      <span key={tag} className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
                        #{tag}
                      </span>
                    ))}
                  </div>
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
          )
        })}
      </div>
    </div>
  )
}
