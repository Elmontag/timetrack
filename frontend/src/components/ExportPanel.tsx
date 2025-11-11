import { FormEvent, useState } from 'react'
import dayjs from 'dayjs'
import { createExport, ExportRecord } from '../api'
import { API_BASE } from '../config'

interface Props {
  onExported: (record: ExportRecord) => void
}

type ExportType = 'timesheet' | 'leave' | 'full'

export function ExportPanel({ onExported }: Props) {
  const [rangeStart, setRangeStart] = useState(dayjs().startOf('month').format('YYYY-MM-DD'))
  const [rangeEnd, setRangeEnd] = useState(dayjs().endOf('month').format('YYYY-MM-DD'))
  const [format, setFormat] = useState<'pdf' | 'xlsx'>('pdf')
  const [type, setType] = useState<ExportType>('timesheet')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    try {
      const exportRecord = await createExport({ type, format, range_start: rangeStart, range_end: rangeEnd })
      onExported(exportRecord)
      window.open(`${API_BASE}/exports/${exportRecord.id}`, '_blank')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <h2 className="text-lg font-semibold text-slate-100">Exporte</h2>
      <p className="text-sm text-slate-400">PDF oder Excel für Stundenzettel, Urlaubslisten oder aggregierte Übersichten erzeugen.</p>
      <form onSubmit={handleSubmit} className="mt-3 grid gap-3 md:grid-cols-5">
        <label className="text-sm text-slate-300">
          Von
          <input
            type="date"
            value={rangeStart}
            onChange={(event) => setRangeStart(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="text-sm text-slate-300">
          Bis
          <input
            type="date"
            value={rangeEnd}
            onChange={(event) => setRangeEnd(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="text-sm text-slate-300">
          Typ
          <select
            value={type}
            onChange={(event) => setType(event.target.value as ExportType)}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="timesheet">Stundenzettel</option>
            <option value="leave">Urlaub/AU</option>
            <option value="full">Vollexport (Arbeit/Urlaub/AU)</option>
          </select>
        </label>
        <label className="text-sm text-slate-300">
          Format
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value as 'pdf' | 'xlsx')}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="pdf">PDF</option>
            <option value="xlsx">Excel</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50"
          >
            Export starten
          </button>
        </div>
      </form>
    </div>
  )
}
