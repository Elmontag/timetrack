import dayjs from 'dayjs'
import { FormEvent, useEffect, useState } from 'react'
import { Subtrack, createSubtrack, listSubtracks } from '../api'

interface Props {
  day: string
  refreshKey?: string
}

export function SubtrackManager({ day, refreshKey }: Props) {
  const [entries, setEntries] = useState<Subtrack[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null)
  const [form, setForm] = useState({
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
            {feedback === 'success' && <span className="text-emerald-400">Subtrack gespeichert.</span>}
            {feedback === 'error' && <span className="text-rose-400">Speichern fehlgeschlagen.</span>}
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
        {entries.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 text-slate-200">
              <span className="font-medium text-slate-100">{item.title}</span>
              <span className="font-mono text-slate-400">
                {formatTime(item.start_time)} – {formatTime(item.end_time)}
              </span>
            </div>
            {item.project && <div className="mt-1 text-xs text-primary">Projekt: {item.project}</div>}
            {item.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {item.note && <p className="mt-2 text-slate-300">{item.note}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
