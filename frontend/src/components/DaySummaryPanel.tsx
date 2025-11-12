import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { DaySummary, TimeDisplayFormat, getDaySummaries } from '../api'
import { formatSeconds } from '../utils/timeFormat'

interface Props {
  refreshKey: string
  timeDisplayFormat: TimeDisplayFormat
}

type ViewMode = 'day' | 'month' | 'year'

export function DaySummaryPanel({ refreshKey, timeDisplayFormat }: Props) {
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
    return summaries.reduce(
      (acc, item) => {
        acc.work += item.work_seconds
        acc.pause += item.pause_seconds
        acc.overtime += item.overtime_seconds
        acc.vacationSeconds += item.vacation_seconds
        acc.sickSeconds += item.sick_seconds
        const baseline = item.baseline_expected_seconds ?? item.expected_seconds
        if (item.vacation_seconds > 0 && baseline) {
          acc.vacationDays += item.vacation_seconds / baseline
        }
        if (item.sick_seconds > 0 && baseline) {
          acc.sickDays += item.sick_seconds / baseline
        }
        return acc
      },
      {
        work: 0,
        pause: 0,
        overtime: 0,
        vacationSeconds: 0,
        sickSeconds: 0,
        vacationDays: 0,
        sickDays: 0,
      },
    )
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
        existing.vacation_seconds += summary.vacation_seconds
        existing.sick_seconds += summary.sick_seconds
      } else {
        grouped.set(monthKey, {
          ...summary,
          day: monthKey,
          vacation_seconds: summary.vacation_seconds,
          sick_seconds: summary.sick_seconds,
          leave_types: [],
          is_weekend: false,
          is_holiday: false,
          holiday_name: null,
        })
      }
    })
    return Array.from(grouped.values())
  }, [summaries, view])

  const includeUnit = timeDisplayFormat === 'decimal'
  const decimalPlaces = timeDisplayFormat === 'decimal' ? 1 : undefined
  const formatHours = (seconds: number) =>
    formatSeconds(seconds, timeDisplayFormat, {
      includeUnit,
      decimalPlaces,
    })
  const formatDays = (value: number) => `${value.toFixed(1).replace('.', ',')} Tage`

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
      <dl className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-sm text-slate-400">Urlaub</dt>
          <dd className="text-xl font-semibold text-slate-100">{formatDays(totals.vacationDays)}</dd>
          <p className="text-xs text-slate-500">{formatHours(totals.vacationSeconds)}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-sm text-slate-400">AU-Tage</dt>
          <dd className="text-xl font-semibold text-slate-100">{formatDays(totals.sickDays)}</dd>
          <p className="text-xs text-slate-500">{formatHours(totals.sickSeconds)}</p>
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
              <th className="px-4 py-2 text-left">Hinweis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((summary) => (
              <tr key={summary.day} className="hover:bg-slate-900/70">
                <td className="px-4 py-2 text-slate-200">{summary.day}</td>
                <td className="px-4 py-2 text-slate-100">{formatHours(summary.work_seconds)}</td>
                <td className="px-4 py-2 text-slate-100">{formatHours(summary.pause_seconds)}</td>
                <td className={`px-4 py-2 font-medium ${summary.overtime_seconds >= 0 ? 'text-slate-100' : 'text-amber-300'}`}>
                  {formatHours(summary.overtime_seconds)}
                </td>
                <td className="px-4 py-2 text-slate-300">
                  {(() => {
                    const hints: string[] = []
                    if (summary.is_holiday && summary.holiday_name) {
                      hints.push(`Feiertag: ${summary.holiday_name}`)
                    }
                    if (summary.is_weekend) {
                      hints.push('Wochenende')
                    }
                    if (summary.leave_types.includes('vacation')) {
                      hints.push('Urlaub')
                    }
                    if (summary.leave_types.includes('sick')) {
                      hints.push('Arbeitsunfähigkeit')
                    }
                    return hints.length > 0 ? hints.join(', ') : '—'
                  })()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-3 text-center text-sm text-slate-400">
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
