import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { DaySummary, getDaySummaries } from '../api'

interface Props {
  refreshKey: string
}

type ViewMode = 'day' | 'month' | 'year'

export function DaySummaryPanel({ refreshKey }: Props) {
  const [view, setView] = useState<ViewMode>('day')
  const [day, setDay] = useState(dayjs().format('YYYY-MM-DD'))
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'))
  const [year, setYear] = useState(dayjs().format('YYYY'))
  const [summaries, setSummaries] = useState<DaySummary[]>([])

  const range = useMemo(() => {
    if (view === 'day') {
      return { start: day, end: day }
    }
    if (view === 'month') {
      const base = dayjs(`${month}-01`)
      return {
        start: base.startOf('month').format('YYYY-MM-DD'),
        end: base.endOf('month').format('YYYY-MM-DD'),
      }
    }
    const base = dayjs(`${year}-01-01`)
    return {
      start: base.startOf('year').format('YYYY-MM-DD'),
      end: base.endOf('year').format('YYYY-MM-DD'),
    }
  }, [view, day, month, year])

  useEffect(() => {
    const run = async () => {
      const data = await getDaySummaries(range.start, range.end)
      setSummaries(data)
    }
    run()
  }, [range, refreshKey])

  const totals = useMemo(() => {
    const work = summaries.reduce((sum, item) => sum + item.work_seconds, 0)
    const overtime = summaries.reduce((sum, item) => sum + item.overtime_seconds, 0)
    const pause = summaries.reduce((sum, item) => sum + item.pause_seconds, 0)
    return { work, overtime, pause }
  }, [summaries])

  const rows = useMemo(() => {
    if (view !== 'year') {
      return summaries
    }
    const grouped = new Map<string, DaySummary>()
    summaries.forEach((summary) => {
      const monthKey = summary.day.slice(0, 7)
      const existing = grouped.get(monthKey)
      if (existing) {
        existing.work_seconds += summary.work_seconds
        existing.pause_seconds += summary.pause_seconds
        existing.overtime_seconds += summary.overtime_seconds
      } else {
        grouped.set(monthKey, {
          ...summary,
          day: monthKey,
        })
      }
    })
    return Array.from(grouped.values())
  }, [summaries, view])

  const formatHours = (seconds: number) => (seconds / 3600).toFixed(1).replace('.', ',') + ' h'

  const viewTitle = view === 'day' ? 'Tagesübersicht' : view === 'month' ? 'Monatsübersicht' : 'Jahresanalyse'

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">{viewTitle}</h2>
          <p className="text-sm text-slate-400">Arbeitszeiten im ausgewählten Zeitraum.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-slate-800">
            {(
              [
                { key: 'day', label: 'Tag' },
                { key: 'month', label: 'Monat' },
                { key: 'year', label: 'Jahr' },
              ] as { key: ViewMode; label: string }[]
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setView(option.key)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  view === option.key ? 'bg-primary text-slate-950' : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {view === 'day' && (
            <input
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          )}
          {view === 'month' && (
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          )}
          {view === 'year' && (
            <input
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="w-24 rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          )}
        </div>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-sm text-slate-400">Arbeit gesamt</dt>
          <dd className="text-2xl font-semibold text-slate-100">{formatHours(totals.work)}</dd>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-sm text-slate-400">Pausen</dt>
          <dd className="text-2xl font-semibold text-slate-100">{formatHours(totals.pause)}</dd>
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
              <th className="px-4 py-2 text-left">{view === 'year' ? 'Monat' : view === 'day' ? 'Tag' : 'Datum'}</th>
              <th className="px-4 py-2 text-left">Arbeit</th>
              <th className="px-4 py-2 text-left">Pausen</th>
              <th className="px-4 py-2 text-left">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((summary) => (
              <tr key={summary.day} className="hover:bg-slate-900/70">
                <td className="px-4 py-2 text-slate-200">{summary.day}</td>
                <td className="px-4 py-2 text-slate-100">{formatHours(summary.work_seconds)}</td>
                <td className="px-4 py-2 text-slate-100">{formatHours(summary.pause_seconds)}</td>
                <td className="px-4 py-2 font-medium text-slate-100">{formatHours(summary.overtime_seconds)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-3 text-center text-sm text-slate-400">
                  Keine Daten im ausgewählten Zeitraum.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
