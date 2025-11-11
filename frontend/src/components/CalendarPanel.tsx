import dayjs from 'dayjs'
import { FormEvent, useEffect, useState } from 'react'
import { CalendarEvent, createCalendarEvent, listCalendarEvents, updateCalendarParticipation } from '../api'

interface Props {
  refreshKey: string
}

export function CalendarPanel({ refreshKey }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [range, setRange] = useState({
    from: dayjs().startOf('month').format('YYYY-MM-DD'),
    to: dayjs().endOf('month').format('YYYY-MM-DD'),
  })
  const [form, setForm] = useState({
    title: '',
    start_time: dayjs().format('YYYY-MM-DDTHH:mm'),
    end_time: dayjs().add(1, 'hour').format('YYYY-MM-DDTHH:mm'),
    location: '',
    description: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const run = async () => {
      const data = await listCalendarEvents({ from_date: range.from, to_date: range.to })
      setEvents(data)
    }
    run()
  }, [range, refreshKey])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      await createCalendarEvent({
        title: form.title,
        start_time: form.start_time,
        end_time: form.end_time,
        location: form.location || undefined,
        description: form.description || undefined,
      })
      const data = await listCalendarEvents({ from_date: range.from, to_date: range.to })
      setEvents(data)
      setForm((prev) => ({ ...prev, title: '', description: '' }))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleParticipation = async (eventId: number, participated: boolean) => {
    await updateCalendarParticipation(eventId, participated)
    const data = await listCalendarEvents({ from_date: range.from, to_date: range.to })
    setEvents(data)
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Kalenderübersicht</h2>
          <p className="text-sm text-slate-400">Markiere Termine als teilgenommen oder nicht teilgenommen.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={range.from}
            onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))}
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <span className="text-slate-500">bis</span>
          <input
            type="date"
            value={range.to}
            onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))}
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>
      <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-6">
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
        <label className="text-sm text-slate-300 md:col-span-2">
          Beginn
          <input
            type="datetime-local"
            value={form.start_time}
            onChange={(event) => setForm((prev) => ({ ...prev, start_time: event.target.value }))}
            required
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="text-sm text-slate-300 md:col-span-2">
          Ende
          <input
            type="datetime-local"
            value={form.end_time}
            onChange={(event) => setForm((prev) => ({ ...prev, end_time: event.target.value }))}
            required
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="text-sm text-slate-300 md:col-span-3">
          Ort
          <input
            type="text"
            value={form.location}
            onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
            placeholder="optional"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="text-sm text-slate-300 md:col-span-3">
          Beschreibung
          <input
            type="text"
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="optional"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <div className="md:col-span-6 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50"
          >
            Termin speichern
          </button>
        </div>
      </form>
      <div className="mt-6 max-h-80 overflow-y-auto rounded-xl border border-slate-800">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2 text-left">Termin</th>
              <th className="px-4 py-2 text-left">Zeitraum</th>
              <th className="px-4 py-2 text-left">Ort</th>
              <th className="px-4 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {events.map((event) => (
              <tr key={event.id} className="hover:bg-slate-900/70">
                <td className="px-4 py-2 text-slate-100">
                  <div className="font-medium">{event.title}</div>
                  {event.description && <div className="text-xs text-slate-500">{event.description}</div>}
                </td>
                <td className="px-4 py-2 text-slate-200">
                  {new Date(event.start_time).toLocaleString()} – {new Date(event.end_time).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-slate-300">{event.location ?? '–'}</td>
                <td className="px-4 py-2">
                  <div className="inline-flex items-center gap-2">
                    <span className={event.participated ? 'text-emerald-400' : 'text-slate-400'}>
                      {event.participated ? 'Teilgenommen' : 'Nicht teilgenommen'}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleParticipation(event.id, !event.participated)}
                      className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 transition hover:border-primary hover:text-primary"
                    >
                      {event.participated ? 'auf Nicht' : 'als Teilgenommen'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-center text-sm text-slate-400">
                  Keine Termine im Zeitraum.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
