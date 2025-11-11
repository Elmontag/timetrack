import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { DaySummary, getDaySummaries } from '../api'

interface Props {
  day: string
  refreshKey: string
}

export function TodaySummary({ day, refreshKey }: Props) {
  const [summary, setSummary] = useState<DaySummary | null>(null)

  useEffect(() => {
    const run = async () => {
      const data = await getDaySummaries(day, day)
      setSummary(data[0] ?? null)
    }
    run()
  }, [day, refreshKey])

  const values = useMemo(() => {
    if (!summary) {
      return {
        workHours: '0,0',
        pauseHours: '0,0',
        overtimeHours: '0,0',
        targetHours: '0,0',
      }
    }
    const workHours = (summary.work_seconds / 3600).toFixed(1).replace('.', ',')
    const pauseHours = (summary.pause_seconds / 3600).toFixed(1).replace('.', ',')
    const overtimeHours = (summary.overtime_seconds / 3600).toFixed(1).replace('.', ',')
    const targetSeconds = summary.work_seconds - summary.overtime_seconds
    const targetHours = (targetSeconds / 3600).toFixed(1).replace('.', ',')
    return { workHours, pauseHours, overtimeHours, targetHours }
  }, [summary])

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Tagesübersicht</h2>
          <p className="text-sm text-slate-400">Arbeitszeit für {dayjs(day).format('DD.MM.YYYY')}.</p>
        </div>
        <span className="text-xs uppercase tracking-wide text-slate-500">Aktualisiert {dayjs().format('HH:mm:ss')}</span>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-xs uppercase text-slate-400">Arbeit</dt>
          <dd className="text-2xl font-semibold text-slate-100">{values.workHours} h</dd>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-xs uppercase text-slate-400">Pausen</dt>
          <dd className="text-2xl font-semibold text-slate-100">{values.pauseHours} h</dd>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-xs uppercase text-slate-400">Soll</dt>
          <dd className="text-2xl font-semibold text-slate-100">{values.targetHours} h</dd>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <dt className="text-xs uppercase text-slate-400">Saldo</dt>
          <dd
            className={`text-2xl font-semibold ${summary && summary.overtime_seconds >= 0 ? 'text-emerald-400' : 'text-slate-100'}`}
          >
            {values.overtimeHours} h
          </dd>
        </div>
      </dl>
    </div>
  )
}
