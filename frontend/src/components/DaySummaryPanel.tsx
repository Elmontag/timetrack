import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { DaySummary, getDaySummaries } from '../api'

interface Props {
  refreshKey: string
}

export function DaySummaryPanel({ refreshKey }: Props) {
  const [rangeStart, setRangeStart] = useState(dayjs().startOf('month').format('YYYY-MM-DD'))
  const [rangeEnd, setRangeEnd] = useState(dayjs().endOf('month').format('YYYY-MM-DD'))
  const [summaries, setSummaries] = useState<DaySummary[]>([])

  useEffect(() => {
    const run = async () => {
      const data = await getDaySummaries(rangeStart, rangeEnd)
      setSummaries(data)
    }
    run()
  }, [rangeStart, rangeEnd, refreshKey])

  const totals = useMemo(() => {
    const work = summaries.reduce((sum, item) => sum + item.work_seconds, 0)
    const overtime = summaries.reduce((sum, item) => sum + item.overtime_seconds, 0)
    return { work, overtime }
  }, [summaries])

  const formatHours = (seconds: number) => (seconds / 3600).toFixed(1).replace('.', ',') + ' h'

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Monatsübersicht</h2>
          <p className="text-sm text-slate-400">Arbeitszeiten im ausgewählten Zeitraum.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={rangeStart}
            onChange={(event) => setRangeStart(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <span className="text-slate-500">bis</span>
          <input
            type="date"
            value={rangeEnd}
            onChange={(event) => setRangeEnd(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-sm text-slate-400">Arbeit gesamt</dt>
          <dd className="text-2xl font-semibold text-slate-100">{formatHours(totals.work)}</dd>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-sm text-slate-400">Überstunden</dt>
          <dd className="text-2xl font-semibold text-slate-100">{formatHours(totals.overtime)}</dd>
        </div>
      </dl>
      <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/40">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2 text-left">Tag</th>
              <th className="px-4 py-2 text-left">Arbeit</th>
              <th className="px-4 py-2 text-left">Pausen</th>
              <th className="px-4 py-2 text-left">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {summaries.map((summary) => (
              <tr key={summary.day} className="hover:bg-slate-900/70">
                <td className="px-4 py-2 text-slate-200">{summary.day}</td>
                <td className="px-4 py-2 text-slate-100">{formatHours(summary.work_seconds)}</td>
                <td className="px-4 py-2 text-slate-100">{formatHours(summary.pause_seconds)}</td>
                <td className="px-4 py-2 font-medium text-slate-100">{formatHours(summary.overtime_seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
