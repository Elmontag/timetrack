import dayjs from 'dayjs'
import { FormEvent, useEffect, useState } from 'react'
import { Subtrack, createSubtrack, deleteSubtrack, listSubtracks, updateSubtrack } from '../api'

interface Props {
  day: string
  refreshKey?: string
}

export function SubtrackManager({ day, refreshKey }: Props) {
  const [entries, setEntries] = useState<Subtrack[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null)
  const [form, setForm] = useState({
    title: '',
    start: '',
    end: '',
    project: '',
    tags: '',
    note: '',
  })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    start: '',
    end: '',
    project: '',
    tags: '',
    note: '',
  })

  const refresh = async () => {
    setLoading(true)
    try {
      const data = await listSubtracks(day)
      setEntries(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [day, refreshKey])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      const payload: Parameters<typeof createSubtrack>[0] = {
        day,
        title: form.title,
      }
      if (form.start) {
        payload.start_time = dayjs(`${day}T${form.start}`).format('YYYY-MM-DDTHH:mm:ss')
      }
      if (form.end) {
        payload.end_time = dayjs(`${day}T${form.end}`).format('YYYY-MM-DDTHH:mm:ss')
      }
      if (form.project) {
        payload.project = form.project
      }
      if (form.note) {
        payload.note = form.note
      }
      if (form.tags) {
        payload.tags = form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      }
      await createSubtrack(payload)
      setFeedback('success')
      setForm({ title: '', start: '', end: '', project: '', tags: '', note: '' })
      await refresh()
    } catch (error) {
      console.error(error)
      setFeedback('error')
    } finally {
      setSaving(false)
    }
  }

  const formatTime = (value: string | null) =>
    value ? dayjs(value).format('HH:mm') : '—'

  const beginEdit = (entry: Subtrack) => {
    setEditingId(entry.id)
    setEditForm({
      title: entry.title,
      start: entry.start_time ? dayjs(entry.start_time).format('HH:mm') : '',
      end: entry.end_time ? dayjs(entry.end_time).format('HH:mm') : '',
      project: entry.project ?? '',
      tags: entry.tags.join(', '),
      note: entry.note ?? '',
    })
    setFeedback(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setFeedback(null)
  }

  const handleUpdate = async (event: FormEvent) => {
    event.preventDefault()
    if (!editingId) return
    setUpdating(true)
    setFeedback(null)
    try {
      const payload: Parameters<typeof updateSubtrack>[1] = {}
      payload.title = editForm.title
      payload.project = editForm.project ? editForm.project : null
      payload.note = editForm.note ? editForm.note : null
      payload.tags = editForm.tags
        ? editForm.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
        : []
      if (editForm.start) {
        payload.start_time = dayjs(`${day}T${editForm.start}`).format('YYYY-MM-DDTHH:mm:ss')
      } else {
        payload.start_time = null
      }
      if (editForm.end) {
        payload.end_time = dayjs(`${day}T${editForm.end}`).format('YYYY-MM-DDTHH:mm:ss')
      } else {
        payload.end_time = null
      }
      await updateSubtrack(editingId, payload)
      setEditingId(null)
      setFeedback('success')
      await refresh()
    } catch (error) {
      console.error(error)
      setFeedback('error')
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async (entry: Subtrack) => {
    if (!window.confirm(`Subtrack „${entry.title}“ wirklich löschen?`)) {
      return
    }
    setDeletingId(entry.id)
    setFeedback(null)
    try {
      await deleteSubtrack(entry.id)
      setFeedback('success')
      if (editingId === entry.id) {
        setEditingId(null)
      }
      await refresh()
    } catch (error) {
      console.error(error)
      setFeedback('error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Subtracks des Tages</h2>
          <p className="text-sm text-slate-400">
            Erfasse Meetings, Projekte, Tags und Notizen für deinen Arbeitstag.
          </p>
        </div>
        <span className="text-xs uppercase tracking-wide text-slate-500">{day}</span>
      </div>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-6">
        <label className="text-sm text-slate-300 md:col-span-2">
          Titel
          <input
            type="text"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            required
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="text-sm text-slate-300">
          Start (optional)
          <input
            type="time"
            value={form.start}
            onChange={(event) => setForm((prev) => ({ ...prev, start: event.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="text-sm text-slate-300">
          Ende (optional)
          <input
            type="time"
            value={form.end}
            onChange={(event) => setForm((prev) => ({ ...prev, end: event.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="text-sm text-slate-300">
          Projekt
          <input
            type="text"
            value={form.project}
            onChange={(event) => setForm((prev) => ({ ...prev, project: event.target.value }))}
            placeholder="optional"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="text-sm text-slate-300 md:col-span-2">
          Tags
          <input
            type="text"
            value={form.tags}
            onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
            placeholder="z. B. Meeting, Kunden"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="text-sm text-slate-300 md:col-span-6">
          Notiz
          <textarea
            value={form.note}
            onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            rows={2}
            placeholder="optional"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <div className="md:col-span-6 flex items-center justify-between">
          <div className="text-sm">
            {feedback === 'success' && <span className="text-emerald-400">Aktion erfolgreich.</span>}
            {feedback === 'error' && <span className="text-rose-400">Aktion fehlgeschlagen.</span>}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50"
          >
            Hinzufügen
          </button>
        </div>
      </form>
      <div className="mt-5 space-y-2">
        {loading && <p className="text-sm text-slate-400">Lade Subtracks…</p>}
        {!loading && entries.length === 0 && (
          <p className="text-sm text-slate-500">Noch keine Subtracks für diesen Tag.</p>
        )}
        {entries.map((item) => {
          const isEditing = editingId === item.id
          return (
            <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
              {isEditing ? (
                <form onSubmit={handleUpdate} className="space-y-3">
                  <label className="block text-sm text-slate-300">
                    Titel
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                      required
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm text-slate-300">
                      Start
                      <input
                        type="time"
                        value={editForm.start}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, start: event.target.value }))}
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </label>
                    <label className="text-sm text-slate-300">
                      Ende
                      <input
                        type="time"
                        value={editForm.end}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, end: event.target.value }))}
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm text-slate-300">
                      Projekt
                      <input
                        type="text"
                        value={editForm.project}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, project: event.target.value }))}
                        placeholder="optional"
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </label>
                    <label className="text-sm text-slate-300">
                      Tags (kommagetrennt)
                      <input
                        type="text"
                        value={editForm.tags}
                        onChange={(event) => setEditForm((prev) => ({ ...prev, tags: event.target.value }))}
                        placeholder="z. B. Meeting, Kunden"
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                      />
                    </label>
                  </div>
                  <label className="block text-sm text-slate-300">
                    Notiz
                    <textarea
                      value={editForm.note}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, note: event.target.value }))}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={updating}
                      className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 disabled:opacity-50"
                    >
                      Speichern
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="inline-flex items-center rounded-md border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                      disabled={updating}
                    >
                      Abbrechen
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-slate-200">
                    <span className="font-medium text-slate-100">{item.title}</span>
                    <span className="font-mono text-slate-400">
                      {formatTime(item.start_time)} – {formatTime(item.end_time)}
                    </span>
                  </div>
                  {item.project && <div className="text-xs text-primary">Projekt: {item.project}</div>}
                  {item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.note && <p className="text-slate-300">{item.note}</p>}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => beginEdit(item)}
                      className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      className="inline-flex items-center rounded-md border border-rose-600 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-600/20"
                      disabled={deletingId === item.id}
                    >
                      {deletingId === item.id ? 'Löschen…' : 'Löschen'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
