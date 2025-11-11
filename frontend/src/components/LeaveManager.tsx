import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { createLeave, getSettings, LeaveEntry, listLeaves } from '../api'
import { HolidayManagerLightbox } from './HolidayManagerLightbox'

interface Props {
  refreshKey: string
  onRefreshed: () => void
}

const leaveTypes = [
  { value: 'vacation', label: 'Urlaub' },
  { value: 'sick', label: 'Arbeitsunfähigkeit' },
  { value: 'remote', label: 'Homeoffice' },
]

export function LeaveManager({ refreshKey, onRefreshed }: Props) {
  const [entries, setEntries] = useState<LeaveEntry[]>([])
  const [form, setForm] = useState({
    start_date: dayjs().format('YYYY-MM-DD'),
    end_date: dayjs().add(1, 'day').format('YYYY-MM-DD'),
    type: 'vacation',
    comment: '',
    approved: true,
  })
  const [vacationAllowance, setVacationAllowance] = useState(0)
  const [vacationCarryover, setVacationCarryover] = useState(0)
  const [holidayModalOpen, setHolidayModalOpen] = useState(false)

  const loadData = useCallback(async () => {
    const [leaveData, settings] = await Promise.all([
      listLeaves({ from_date: dayjs().startOf('year').format('YYYY-MM-DD'), to_date: dayjs().endOf('year').format('YYYY-MM-DD') }),
      getSettings(),
    ])
    setEntries(leaveData)
    setVacationAllowance(settings.vacation_days_per_year)
    setVacationCarryover(settings.vacation_days_carryover)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await createLeave(form)
    onRefreshed()
    await loadData()
  }

  const vacationStats = useMemo(() => {
    const used = entries
      .filter((entry) => entry.type === 'vacation')
      .reduce((sum, entry) => sum + entry.day_count, 0)
    const total = vacationAllowance + vacationCarryover
    const remaining = Math.max(total - used, 0)
    return {
      used,
      total,
      remaining,
    }
  }, [entries, vacationAllowance, vacationCarryover])

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Abwesenheiten</h2>
          <p className="text-sm text-slate-400">Urlaub und Arbeitsunfähigkeit im Blick behalten.</p>
        </div>
        <button
          type="button"
          onClick={() => setHolidayModalOpen(true)}
          className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-primary hover:text-primary"
        >
          Feiertage verwalten
        </button>
      </div>
      <form onSubmit={handleSubmit} className="mt-3 grid gap-3 md:grid-cols-4">
        <label className="text-sm text-slate-300">
          Von
          <input
            type="date"
            value={form.start_date}
            onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            required
          />
        </label>
        <label className="text-sm text-slate-300">
          Bis
          <input
            type="date"
            value={form.end_date}
            onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            required
          />
        </label>
        <label className="text-sm text-slate-300">
          Typ
          <select
            value={form.type}
            onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {leaveTypes.map((leave) => (
              <option key={leave.value} value={leave.value}>
                {leave.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-300 md:col-span-2">
          Kommentar
          <input
            type="text"
            value={form.comment}
            onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))}
            placeholder="optional"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={form.approved}
            onChange={(event) => setForm((prev) => ({ ...prev, approved: event.target.checked }))}
            className="h-4 w-4 rounded border border-slate-700 bg-slate-950 text-primary focus:ring-primary"
          />
          genehmigt
        </label>
        <div className="md:col-span-4">
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            Speichern
          </button>
        </div>
      </form>
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <dt className="text-xs uppercase tracking-wide text-slate-400">Urlaub gesamt</dt>
          <dd className="mt-1 text-xl font-semibold text-slate-100">{vacationStats.total.toFixed(1)} Tage</dd>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <dt className="text-xs uppercase tracking-wide text-slate-400">Verbraucht</dt>
          <dd className="mt-1 text-xl font-semibold text-slate-100">{vacationStats.used.toFixed(1)} Tage</dd>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <dt className="text-xs uppercase tracking-wide text-slate-400">Rest</dt>
          <dd className="mt-1 text-xl font-semibold text-slate-100">{vacationStats.remaining.toFixed(1)} Tage</dd>
          <p className="text-[11px] text-slate-500">inkl. Übertrag: {vacationCarryover.toFixed(1)} Tage</p>
        </div>
      </dl>
      <div className="mt-4 max-h-56 overflow-y-auto rounded-lg border border-slate-800">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2 text-left">Zeitraum</th>
              <th className="px-4 py-2 text-left">Typ</th>
              <th className="px-4 py-2 text-left">Kommentar</th>
              <th className="px-4 py-2 text-left">Tage</th>
              <th className="px-4 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-slate-900/70">
                <td className="px-4 py-2 text-slate-100">
                  {entry.start_date} – {entry.end_date}
                </td>
                <td className="px-4 py-2 text-slate-100">{leaveTypes.find((item) => item.value === entry.type)?.label ?? entry.type}</td>
                <td className="px-4 py-2 text-slate-300">{entry.comment || '—'}</td>
                <td className="px-4 py-2 text-slate-100">{entry.day_count.toFixed(1)}</td>
                <td className="px-4 py-2 text-slate-300">{entry.approved ? 'genehmigt' : 'offen'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <HolidayManagerLightbox
        open={holidayModalOpen}
        onClose={() => setHolidayModalOpen(false)}
        onUpdated={async () => {
          await loadData()
        }}
      />
    </div>
  )
}
