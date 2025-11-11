import dayjs from 'dayjs'
import { FormEvent, useEffect, useState } from 'react'
import { createManualSession } from '../api'

interface Props {
  onCreated: () => void
  defaultDate?: string
}

const createInitialRange = (defaultDate?: string) => {
  if (!defaultDate) {
    const now = dayjs()
    return {
      start: now.startOf('hour').subtract(1, 'hour').format('YYYY-MM-DDTHH:mm'),
      end: now.startOf('hour').format('YYYY-MM-DDTHH:mm'),
    }
  }
  const base = dayjs(defaultDate).hour(9).minute(0).second(0)
  return {
    start: base.format('YYYY-MM-DDTHH:mm'),
    end: base.add(1, 'hour').format('YYYY-MM-DDTHH:mm'),
  }
}

export function ManualEntryForm({ onCreated, defaultDate }: Props) {
  const initialRange = createInitialRange(defaultDate)
  const [form, setForm] = useState({
    start: initialRange.start,
    end: initialRange.end,
    project: '',
    tags: '',
    comment: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<'success' | 'error' | null>(null)

  useEffect(() => {
    if (!defaultDate) {
      return
    }
    const nextRange = createInitialRange(defaultDate)
    setForm((prev) => ({
      ...prev,
      start: nextRange.start,
      end: nextRange.end,
    }))
  }, [defaultDate])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setFeedback(null)
    try {
      await createManualSession({
        start_time: form.start,
        end_time: form.end,
        project: form.project || undefined,
        comment: form.comment || undefined,
        tags: form.tags ? form.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
      })
      setFeedback('success')
      setForm((prev) => ({ ...prev, comment: '', tags: '' }))
      onCreated()
    } catch (error) {
      console.error(error)
      setFeedback('error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <h2 className="text-lg font-semibold text-slate-100">Arbeitszeit nachtragen</h2>
      <p className="text-sm text-slate-400">Dokumentiere Meetings oder vergessene Zeitblöcke nachträglich.</p>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 md:grid-cols-6">
        <label className="text-sm text-slate-300 md:col-span-2">
          Beginn
          <input
            type="datetime-local"
            value={form.start}
            onChange={(event) => setForm((prev) => ({ ...prev, start: event.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            required
          />
        </label>
        <label className="text-sm text-slate-300 md:col-span-2">
          Ende
          <input
            type="datetime-local"
            value={form.end}
            onChange={(event) => setForm((prev) => ({ ...prev, end: event.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            required
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
        <label className="text-sm text-slate-300">
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
          Kommentar
          <textarea
            value={form.comment}
            onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))}
            rows={2}
            placeholder="optional"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <div className="md:col-span-6 flex items-center justify-between">
          <div className="text-sm">
            {feedback === 'success' && <span className="text-emerald-400">Eintrag gespeichert.</span>}
            {feedback === 'error' && <span className="text-rose-400">Speichern fehlgeschlagen.</span>}
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50"
          >
            Nachtrag speichern
          </button>
        </div>
      </form>
    </div>
  )
}
