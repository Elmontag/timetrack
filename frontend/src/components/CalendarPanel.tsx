import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarEvent,
  createCalendarEvent,
  createLeave,
  DaySummary,
  getDaySummaries,
  getSettings,
  LeaveEntry,
  listCalendarEvents,
  listLeaves,
  SettingsResponse,
  updateCalendarEvent,
} from '../api'
import { ManualEntryForm } from './ManualEntryForm'
import { SessionList } from './SessionList'
import { HolidayManagerLightbox } from './HolidayManagerLightbox'

dayjs.extend(isoWeek)

interface Props {
  refreshKey: string
  onDataChanged?: () => void
}

type ViewMode = 'day' | 'week' | 'month' | 'year'

type EventStatus = 'pending' | 'attended' | 'absent' | 'cancelled'

type LeaveType = 'vacation' | 'sick' | 'remote'

const VIEW_OPTIONS: { key: ViewMode; label: string }[] = [
  { key: 'day', label: 'Tag' },
  { key: 'week', label: 'Woche' },
  { key: 'month', label: 'Monat' },
  { key: 'year', label: 'Jahr' },
]

const EVENT_STATUS_META: Record<EventStatus, { label: string; badgeClass: string }> = {
  pending: { label: 'Offen', badgeClass: 'bg-slate-900/60 text-slate-200' },
  attended: { label: 'Teilgenommen', badgeClass: 'bg-emerald-500/10 text-emerald-300' },
  absent: { label: 'Nicht teilgenommen', badgeClass: 'bg-amber-500/10 text-amber-300' },
  cancelled: { label: 'Hinfällig', badgeClass: 'bg-rose-500/10 text-rose-300' },
}

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'vacation', label: 'Urlaub' },
  { value: 'sick', label: 'Arbeitsunfähigkeit' },
  { value: 'remote', label: 'Homeoffice' },
]

const formatHours = (seconds: number) => `${(seconds / 3600).toFixed(1).replace('.', ',')} h`
const formatDays = (value: number) => `${value.toFixed(1).replace('.', ',')} Tage`

const createDefaultEventForm = (referenceDay: string) => {
  const base = dayjs(referenceDay).hour(9).minute(0).second(0)
  return {
    title: '',
    start_time: base.format('YYYY-MM-DDTHH:mm'),
    end_time: base.add(1, 'hour').format('YYYY-MM-DDTHH:mm'),
    location: '',
    description: '',
    status: 'pending' as EventStatus,
  }
}

const createDefaultLeaveForm = (referenceDay: string) => ({
  start_date: referenceDay,
  end_date: referenceDay,
  type: 'vacation' as LeaveType,
  comment: '',
  approved: true,
})

const isDateWithinLeave = (day: string, leave: LeaveEntry) =>
  day >= leave.start_date && day <= leave.end_date

export function CalendarPanel({ refreshKey, onDataChanged }: Props) {
  const today = dayjs().format('YYYY-MM-DD')
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [pivotDate, setPivotDate] = useState(today)
  const [selectedDay, setSelectedDay] = useState(today)
  const [range, setRange] = useState(() => ({
    from: dayjs(today).startOf('month').format('YYYY-MM-DD'),
    to: dayjs(today).endOf('month').format('YYYY-MM-DD'),
  }))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [summaries, setSummaries] = useState<DaySummary[]>([])
  const [leaves, setLeaves] = useState<LeaveEntry[]>([])
  const [settings, setSettings] = useState<Pick<SettingsResponse, 'vacation_days_per_year' | 'vacation_days_carryover'> | null>(
    null,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventForm, setEventForm] = useState(() => createDefaultEventForm(today))
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [updatingEventId, setUpdatingEventId] = useState<number | null>(null)
  const [leaveForm, setLeaveForm] = useState(() => createDefaultLeaveForm(today))
  const [creatingLeave, setCreatingLeave] = useState(false)
  const [leaveFeedback, setLeaveFeedback] = useState<'success' | 'error' | null>(null)
  const [holidayModalOpen, setHolidayModalOpen] = useState(false)

  useEffect(() => {
    const pivot = dayjs(pivotDate)
    let start = pivot
    let end = pivot
    switch (viewMode) {
      case 'day':
        start = pivot.startOf('day')
        end = pivot.endOf('day')
        break
      case 'week':
        start = pivot.startOf('week')
        end = pivot.endOf('week')
        break
      case 'month':
        start = pivot.startOf('month')
        end = pivot.endOf('month')
        break
      case 'year':
        start = pivot.startOf('year')
        end = pivot.endOf('year')
        break
      default:
        break
    }
    const nextRange = {
      from: start.format('YYYY-MM-DD'),
      to: end.format('YYYY-MM-DD'),
    }
    setRange((prev) => (prev.from === nextRange.from && prev.to === nextRange.to ? prev : nextRange))
  }, [pivotDate, viewMode])

  const daysInRange = useMemo(() => {
    if (viewMode === 'year') {
      return []
    }
    const start = dayjs(range.from)
    const end = dayjs(range.to)
    const days: dayjs.Dayjs[] = []
    for (let cursor = start; !cursor.isAfter(end); cursor = cursor.add(1, 'day')) {
      days.push(cursor)
    }
    return days
  }, [range.from, range.to, viewMode])

  const monthsInRange = useMemo(() => {
    if (viewMode !== 'year') {
      return []
    }
    const start = dayjs(range.from).startOf('month')
    const end = dayjs(range.to).startOf('month')
    const months: dayjs.Dayjs[] = []
    for (let cursor = start; !cursor.isAfter(end); cursor = cursor.add(1, 'month')) {
      months.push(cursor)
    }
    return months
  }, [range.from, range.to, viewMode])

  useEffect(() => {
    if (viewMode === 'year') {
      const start = dayjs(range.from)
      const end = dayjs(range.to)
      if (dayjs(selectedDay).isBefore(start) || dayjs(selectedDay).isAfter(end)) {
        setSelectedDay(start.format('YYYY-MM-DD'))
      }
      return
    }
    if (daysInRange.length === 0) {
      return
    }
    const first = daysInRange[0]
    const last = daysInRange[daysInRange.length - 1]
    if (dayjs(selectedDay).isBefore(first) || dayjs(selectedDay).isAfter(last)) {
      setSelectedDay(first.format('YYYY-MM-DD'))
    }
  }, [daysInRange, range.from, range.to, selectedDay, viewMode])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [eventData, summaryData, leaveData] = await Promise.all([
        listCalendarEvents({ from_date: range.from, to_date: range.to }),
        getDaySummaries(range.from, range.to),
        listLeaves({ from_date: range.from, to_date: range.to }),
      ])
      setEvents(eventData)
      setSummaries(summaryData)
      setLeaves(leaveData)
    } catch (err) {
      console.error('Kalenderdaten konnten nicht geladen werden', err)
      setError('Kalenderdaten konnten nicht geladen werden.')
      setEvents([])
      setSummaries([])
      setLeaves([])
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    loadData()
  }, [loadData, refreshKey])

  useEffect(() => {
    const init = async () => {
      try {
        const data = await getSettings()
        setSettings({
          vacation_days_per_year: data.vacation_days_per_year,
          vacation_days_carryover: data.vacation_days_carryover,
        })
      } catch (err) {
        console.error('Einstellungen konnten nicht geladen werden', err)
      }
    }
    init()
  }, [])

  useEffect(() => {
    setEventForm((prev) => {
      const defaults = createDefaultEventForm(selectedDay)
      return {
        ...prev,
        start_time: defaults.start_time,
        end_time: defaults.end_time,
      }
    })
    setLeaveForm((prev) => ({
      ...prev,
      start_date: selectedDay,
      end_date: selectedDay,
    }))
  }, [selectedDay])

  const navigateRange = (direction: -1 | 1) => {
    const pivot = dayjs(pivotDate)
    let next = pivot
    switch (viewMode) {
      case 'day':
        next = pivot.add(direction, 'day')
        break
      case 'week':
        next = pivot.add(direction, 'week')
        break
      case 'month':
        next = pivot.add(direction, 'month')
        break
      case 'year':
        next = pivot.add(direction, 'year')
        break
      default:
        break
    }
    setPivotDate(next.format('YYYY-MM-DD'))
  }

  const summaryMap = useMemo(() => {
    const map = new Map<string, DaySummary>()
    summaries.forEach((summary) => {
      map.set(summary.day, summary)
    })
    return map
  }, [summaries])

  const totals = useMemo(
    () =>
      summaries.reduce(
        (acc, item) => {
          acc.work += item.work_seconds
          acc.pause += item.pause_seconds
          acc.overtime += item.overtime_seconds
          acc.vacationSeconds += item.vacation_seconds
          acc.sickSeconds += item.sick_seconds
          return acc
        },
        { work: 0, pause: 0, overtime: 0, vacationSeconds: 0, sickSeconds: 0 },
      ),
    [summaries],
  )

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    events.forEach((event) => {
      const key = dayjs(event.start_time).format('YYYY-MM-DD')
      const list = map.get(key) ?? []
      list.push(event)
      map.set(key, list)
    })
    return map
  }, [events])

  const eventsByMonth = useMemo(() => {
    const map = new Map<string, number>()
    events.forEach((event) => {
      const key = dayjs(event.start_time).format('YYYY-MM')
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return map
  }, [events])

  const monthlySummary = useMemo(() => {
    const map = new Map<
      string,
      {
        workSeconds: number
        pauseSeconds: number
        overtimeSeconds: number
        vacationSeconds: number
        sickSeconds: number
      }
    >()
    summaries.forEach((summary) => {
      const key = summary.day.slice(0, 7)
      const entry =
        map.get(key) ?? {
          workSeconds: 0,
          pauseSeconds: 0,
          overtimeSeconds: 0,
          vacationSeconds: 0,
          sickSeconds: 0,
        }
      entry.workSeconds += summary.work_seconds
      entry.pauseSeconds += summary.pause_seconds
      entry.overtimeSeconds += summary.overtime_seconds
      entry.vacationSeconds += summary.vacation_seconds
      entry.sickSeconds += summary.sick_seconds
      map.set(key, entry)
    })
    return map
  }, [summaries])

  const monthlyLeaveDays = useMemo(() => {
    const map = new Map<string, { vacation: number; sick: number; other: number }>()
    leaves.forEach((leave) => {
      const start = dayjs(leave.start_date)
      const end = dayjs(leave.end_date)
      for (let cursor = start; !cursor.isAfter(end); cursor = cursor.add(1, 'day')) {
        const key = cursor.format('YYYY-MM')
        const entry = map.get(key) ?? { vacation: 0, sick: 0, other: 0 }
        if (leave.type === 'vacation') {
          entry.vacation += 1
        } else if (leave.type === 'sick') {
          entry.sick += 1
        } else {
          entry.other += 1
        }
        map.set(key, entry)
      }
    })
    return map
  }, [leaves])

  const selectedSummary = summaryMap.get(selectedDay) ?? null
  const selectedEvents = eventsByDay.get(selectedDay) ?? []
  const selectedLeaves = useMemo(
    () => leaves.filter((leave) => isDateWithinLeave(selectedDay, leave)),
    [leaves, selectedDay],
  )

  const absenceStats = useMemo(() => {
    const usedVacation = leaves
      .filter((entry) => entry.type === 'vacation')
      .reduce((sum, entry) => sum + entry.day_count, 0)
    const usedSick = leaves
      .filter((entry) => entry.type === 'sick')
      .reduce((sum, entry) => sum + entry.day_count, 0)
    const totalVacation =
      (settings?.vacation_days_per_year ?? 0) + (settings?.vacation_days_carryover ?? 0)
    return {
      usedVacation,
      usedSick,
      totalVacation,
      remainingVacation: Math.max(totalVacation - usedVacation, 0),
    }
  }, [leaves, settings])

  const handleEventSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setCreatingEvent(true)
    try {
      await createCalendarEvent({
        title: eventForm.title,
        start_time: eventForm.start_time,
        end_time: eventForm.end_time,
        location: eventForm.location || undefined,
        description: eventForm.description || undefined,
        status: eventForm.status,
        participated: eventForm.status === 'attended',
      })
      await loadData()
      setEventForm((prev) => ({
        ...prev,
        title: '',
        description: '',
        location: '',
      }))
    } finally {
      setCreatingEvent(false)
    }
  }

  const updateEventStatus = async (eventId: number, status: EventStatus) => {
    setUpdatingEventId(eventId)
    try {
      await updateCalendarEvent(eventId, { status, participated: status === 'attended' })
      await loadData()
    } finally {
      setUpdatingEventId(null)
    }
  }

  const handleLeaveSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setCreatingLeave(true)
    setLeaveFeedback(null)
    try {
      await createLeave(leaveForm)
      await loadData()
      setLeaveFeedback('success')
      onDataChanged?.()
    } catch (err) {
      console.error('Abwesenheit konnte nicht gespeichert werden', err)
      setLeaveFeedback('error')
    } finally {
      setCreatingLeave(false)
    }
  }

  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) =>
        dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf(),
      ),
    [events],
  )

  const eventsGrouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    sortedEvents.forEach((event) => {
      const key = dayjs(event.start_time).format('YYYY-MM-DD')
      const list = map.get(key) ?? []
      list.push(event)
      map.set(key, list)
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [sortedEvents])

  const formattedRange = `${dayjs(range.from).format('DD.MM.YYYY')} – ${dayjs(range.to).format('DD.MM.YYYY')}`

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Kalender</h2>
            <p className="text-sm text-slate-400">
              Arbeitszeit, Termine und Abwesenheiten in einer Oberfläche.
            </p>
            <p className="mt-1 text-xs text-slate-500">Zeitraum: {formattedRange}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-md border border-slate-800">
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setViewMode(option.key)}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    viewMode === option.key
                      ? 'bg-primary text-slate-950'
                      : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigateRange(-1)}
                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 transition hover:border-primary hover:text-primary"
              >
                ←
              </button>
              <input
                type="date"
                value={pivotDate}
                onChange={(event) => setPivotDate(event.target.value)}
                className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                type="button"
                onClick={() => navigateRange(1)}
                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 transition hover:border-primary hover:text-primary"
              >
                →
              </button>
            </div>
          </div>
        </div>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Arbeitszeit</dt>
            <dd className="mt-1 text-xl font-semibold text-slate-100">{formatHours(totals.work)}</dd>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Pausen</dt>
            <dd className="mt-1 text-xl font-semibold text-slate-100">{formatHours(totals.pause)}</dd>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Saldo</dt>
            <dd className="mt-1 text-xl font-semibold text-slate-100">{formatHours(totals.overtime)}</dd>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-slate-400">Abwesenheiten</dt>
            <dd className="mt-1 text-xl font-semibold text-slate-100">
              {formatHours(totals.vacationSeconds + totals.sickSeconds)}
            </dd>
          </div>
        </dl>
        {loading && (
          <p className="mt-4 text-sm text-slate-400">Lade Daten…</p>
        )}
        {!loading && viewMode !== 'year' && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {daysInRange.map((day) => {
              const dayKey = day.format('YYYY-MM-DD')
              const summary = summaryMap.get(dayKey)
              const dailyEvents = eventsByDay.get(dayKey) ?? []
              const dayLeaves = leaves.filter((leave) => isDateWithinLeave(dayKey, leave))
              const isSelected = selectedDay === dayKey
              return (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => setSelectedDay(dayKey)}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? 'border-primary bg-primary/10 shadow-lg'
                      : 'border-slate-800 bg-slate-950/60 hover:border-primary/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span className="font-medium text-slate-100">{day.format('ddd, DD.MM.')}</span>
                    {summary?.is_holiday && summary?.holiday_name ? (
                      <span className="text-xs text-amber-300">{summary.holiday_name}</span>
                    ) : summary?.is_weekend ? (
                      <span className="text-xs text-slate-500">Wochenende</span>
                    ) : null}
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-slate-100">
                    {summary ? formatHours(summary.work_seconds) : '0,0 h'}
                  </div>
                  <p className="text-xs text-slate-400">Arbeitszeit</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                    {dailyEvents.length > 0 && (
                      <span className="inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5">
                        Termine: {dailyEvents.length}
                      </span>
                    )}
                    {dayLeaves.map((leave) => (
                      <span
                        key={`${leave.id}-${dayKey}`}
                        className="inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5"
                      >
                        {LEAVE_TYPES.find((type) => type.value === leave.type)?.label ?? leave.type}
                      </span>
                    ))}
                  </div>
                </button>
              )
            })}
            {daysInRange.length === 0 && (
              <p className="text-sm text-slate-500">Keine Tage im ausgewählten Zeitraum.</p>
            )}
          </div>
        )}
        {!loading && viewMode === 'year' && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {monthsInRange.map((month) => {
              const monthKey = month.format('YYYY-MM')
              const monthSummary = monthlySummary.get(monthKey)
              const leaveInfo = monthlyLeaveDays.get(monthKey)
              const eventCount = eventsByMonth.get(monthKey) ?? 0
              return (
                <button
                  key={monthKey}
                  type="button"
                  onClick={() => {
                    setPivotDate(month.startOf('month').format('YYYY-MM-DD'))
                    setViewMode('month')
                  }}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-left transition hover:border-primary/60"
                >
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span className="font-medium text-slate-100">{month.format('MMMM YYYY')}</span>
                    <span className="text-xs text-slate-500">{eventCount} Termine</span>
                  </div>
                  <div className="mt-3 text-2xl font-semibold text-slate-100">
                    {monthSummary ? formatHours(monthSummary.workSeconds) : '0,0 h'}
                  </div>
                  <p className="text-xs text-slate-400">Arbeitszeit</p>
                  {leaveInfo && (
                    <div className="mt-3 space-y-1 text-xs text-slate-300">
                      {leaveInfo.vacation > 0 && <div>Urlaub: {leaveInfo.vacation} Tage</div>}
                      {leaveInfo.sick > 0 && <div>Arbeitsunfähigkeit: {leaveInfo.sick} Tage</div>}
                      {leaveInfo.other > 0 && <div>Weitere Abwesenheit: {leaveInfo.other} Tage</div>}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </section>
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Termine & Meetings</h3>
                <p className="text-sm text-slate-400">
                  Plane neue Termine und aktualisiere den Teilnahme-Status direkt hier.
                </p>
              </div>
            </div>
            <form onSubmit={handleEventSubmit} className="mt-4 grid gap-4 md:grid-cols-6">
              <label className="text-sm text-slate-300 md:col-span-3">
                Titel
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(event) =>
                    setEventForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  required
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <label className="text-sm text-slate-300 md:col-span-3">
                Ort
                <input
                  type="text"
                  value={eventForm.location}
                  onChange={(event) =>
                    setEventForm((prev) => ({ ...prev, location: event.target.value }))
                  }
                  placeholder="optional"
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <label className="text-sm text-slate-300 md:col-span-3">
                Beginn
                <input
                  type="datetime-local"
                  value={eventForm.start_time}
                  onChange={(event) =>
                    setEventForm((prev) => ({ ...prev, start_time: event.target.value }))
                  }
                  required
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <label className="text-sm text-slate-300 md:col-span-3">
                Ende
                <input
                  type="datetime-local"
                  value={eventForm.end_time}
                  onChange={(event) =>
                    setEventForm((prev) => ({ ...prev, end_time: event.target.value }))
                  }
                  required
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <label className="text-sm text-slate-300 md:col-span-4">
                Beschreibung
                <input
                  type="text"
                  value={eventForm.description}
                  onChange={(event) =>
                    setEventForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="optional"
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <label className="text-sm text-slate-300 md:col-span-2">
                Status
                <select
                  value={eventForm.status}
                  onChange={(event) =>
                    setEventForm((prev) => ({
                      ...prev,
                      status: event.target.value as EventStatus,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {Object.entries(EVENT_STATUS_META).map(([status, meta]) => (
                    <option key={status} value={status}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="md:col-span-6 flex justify-end">
                <button
                  type="submit"
                  disabled={creatingEvent}
                  className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50"
                >
                  Termin speichern
                </button>
              </div>
            </form>
            <div className="mt-6 max-h-80 space-y-4 overflow-y-auto">
              {error && (
                <p className="text-sm text-rose-300">{error}</p>
              )}
              {!error && eventsGrouped.length === 0 && !loading && (
                <p className="text-sm text-slate-500">Keine Termine im Zeitraum.</p>
              )}
              {eventsGrouped.map(([day, entries]) => (
                <div key={day}>
                  <div className="flex items-center justify-between text-sm text-slate-400">
                    <span className="font-medium text-slate-200">
                      {dayjs(day).format('dddd, DD.MM.YYYY')}
                    </span>
                    <span>{entries.length} Termine</span>
                  </div>
                  <div className="mt-2 space-y-3">
                    {entries.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-slate-100">{event.title}</p>
                            <p className="text-xs text-slate-400">
                              {dayjs(event.start_time).format('DD.MM.YYYY HH:mm')} –{' '}
                              {dayjs(event.end_time).format('DD.MM.YYYY HH:mm')}
                            </p>
                            {event.location && (
                              <p className="mt-1 text-xs text-slate-400">{event.location}</p>
                            )}
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              EVENT_STATUS_META[event.status as EventStatus]?.badgeClass ??
                              EVENT_STATUS_META.pending.badgeClass
                            }`}
                          >
                            {EVENT_STATUS_META[event.status as EventStatus]?.label ??
                              EVENT_STATUS_META.pending.label}
                          </span>
                        </div>
                        {event.description && (
                          <p className="mt-3 text-sm text-slate-300">{event.description}</p>
                        )}
                        {event.attendees.length > 0 && (
                          <div className="mt-3 text-xs text-slate-400">
                            Teilnehmer: {event.attendees.join(', ')}
                          </div>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2 text-xs">
                          {(['attended', 'absent', 'cancelled'] as EventStatus[]).map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => updateEventStatus(event.id, status)}
                              disabled={updatingEventId === event.id}
                              className={`rounded-md border px-2 py-1 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                event.status === status
                                  ? 'border-primary text-primary'
                                  : 'border-slate-700 text-slate-200 hover:border-primary hover:text-primary'
                              }`}
                            >
                              {EVENT_STATUS_META[status].label}
                            </button>
                          ))}
                          {event.status !== 'pending' && (
                            <button
                              type="button"
                              onClick={() => updateEventStatus(event.id, 'pending')}
                              disabled={updatingEventId === event.id}
                              className="rounded-md border border-slate-700 px-2 py-1 text-slate-200 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Zurücksetzen
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Tag im Fokus</h3>
                <p className="text-sm text-slate-400">
                  {dayjs(selectedDay).format('dddd, DD.MM.YYYY')}
                </p>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Arbeitszeit</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-100">
                  {selectedSummary ? formatHours(selectedSummary.work_seconds) : '0,0 h'}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Pausen</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-100">
                  {selectedSummary ? formatHours(selectedSummary.pause_seconds) : '0,0 h'}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Saldo</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-100">
                  {selectedSummary ? formatHours(selectedSummary.overtime_seconds) : '0,0 h'}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Hinweise</dt>
                <dd className="mt-1 text-sm text-slate-200">
                  {(() => {
                    if (!selectedSummary) {
                      return '—'
                    }
                    const hints: string[] = []
                    if (selectedSummary.is_holiday && selectedSummary.holiday_name) {
                      hints.push(`Feiertag: ${selectedSummary.holiday_name}`)
                    }
                    if (selectedSummary.is_weekend) {
                      hints.push('Wochenende')
                    }
                    if (selectedSummary.leave_types.includes('vacation')) {
                      hints.push('Urlaub')
                    }
                    if (selectedSummary.leave_types.includes('sick')) {
                      hints.push('Arbeitsunfähigkeit')
                    }
                    return hints.length > 0 ? hints.join(', ') : '—'
                  })()}
                </dd>
              </div>
            </dl>
            <div className="mt-4 space-y-3">
              {selectedLeaves.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Abwesenheiten</p>
                  <ul className="mt-2 space-y-2 text-sm text-slate-200">
                    {selectedLeaves.map((leave) => (
                      <li
                        key={leave.id}
                        className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span>
                            {LEAVE_TYPES.find((item) => item.value === leave.type)?.label ?? leave.type}
                          </span>
                          <span className="text-xs text-slate-400">
                            {leave.start_date} – {leave.end_date}
                          </span>
                        </div>
                        {leave.comment && (
                          <p className="mt-1 text-xs text-slate-400">{leave.comment}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedEvents.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Termine</p>
                  <ul className="mt-2 space-y-2 text-sm text-slate-200">
                    {selectedEvents.map((event) => (
                      <li key={event.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                        <div className="flex items-center justify-between">
                          <span>{event.title}</span>
                          <span className="text-xs text-slate-400">
                            {dayjs(event.start_time).format('HH:mm')} – {dayjs(event.end_time).format('HH:mm')}
                          </span>
                        </div>
                        <span
                          className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            EVENT_STATUS_META[event.status as EventStatus]?.badgeClass ??
                            EVENT_STATUS_META.pending.badgeClass
                          }`}
                        >
                          {EVENT_STATUS_META[event.status as EventStatus]?.label ??
                            EVENT_STATUS_META.pending.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
          <SessionList
            refreshKey={refreshKey}
            day={selectedDay}
            showDayPicker={false}
            onChanged={() => {
              onDataChanged?.()
              loadData()
            }}
          />
          <ManualEntryForm
            onCreated={async () => {
              await loadData()
              onDataChanged?.()
            }}
            defaultDate={selectedDay}
          />
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">Abwesenheiten & Urlaub</h3>
                <p className="text-sm text-slate-400">
                  Behalte Urlaube, Krankheitstage und Homeoffice im Blick.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHolidayModalOpen(true)}
                className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-primary hover:text-primary"
              >
                Feiertage verwalten
              </button>
            </div>
            <form onSubmit={handleLeaveSubmit} className="mt-4 grid gap-3 md:grid-cols-6">
              <label className="text-sm text-slate-300 md:col-span-3">
                Von
                <input
                  type="date"
                  value={leaveForm.start_date}
                  onChange={(event) =>
                    setLeaveForm((prev) => ({ ...prev, start_date: event.target.value }))
                  }
                  required
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <label className="text-sm text-slate-300 md:col-span-3">
                Bis
                <input
                  type="date"
                  value={leaveForm.end_date}
                  onChange={(event) =>
                    setLeaveForm((prev) => ({ ...prev, end_date: event.target.value }))
                  }
                  required
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <label className="text-sm text-slate-300 md:col-span-2">
                Typ
                <select
                  value={leaveForm.type}
                  onChange={(event) =>
                    setLeaveForm((prev) => ({
                      ...prev,
                      type: event.target.value as LeaveType,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {LEAVE_TYPES.map((leave) => (
                    <option key={leave.value} value={leave.value}>
                      {leave.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-300 md:col-span-4">
                Kommentar
                <input
                  type="text"
                  value={leaveForm.comment}
                  onChange={(event) =>
                    setLeaveForm((prev) => ({ ...prev, comment: event.target.value }))
                  }
                  placeholder="optional"
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-3">
                <input
                  type="checkbox"
                  checked={leaveForm.approved}
                  onChange={(event) =>
                    setLeaveForm((prev) => ({ ...prev, approved: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border border-slate-700 bg-slate-950 text-primary focus:ring-primary"
                />
                genehmigt
              </label>
              <div className="md:col-span-3 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={creatingLeave}
                  className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50"
                >
                  Abwesenheit speichern
                </button>
              </div>
            </form>
            {leaveFeedback === 'success' && (
              <p className="mt-2 text-sm text-emerald-400">Abwesenheit gespeichert.</p>
            )}
            {leaveFeedback === 'error' && (
              <p className="mt-2 text-sm text-rose-400">Speichern fehlgeschlagen.</p>
            )}
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Urlaub gesamt</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-100">
                  {formatDays(absenceStats.totalVacation)}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Verbraucht</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-100">
                  {formatDays(absenceStats.usedVacation)}
                </dd>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <dt className="text-xs uppercase tracking-wide text-slate-400">Rest</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-100">
                  {formatDays(absenceStats.remainingVacation)}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-slate-500">
              Arbeitsunfähigkeit in Summe: {absenceStats.usedSick.toFixed(1)} Tage
            </p>
            <div className="mt-4 max-h-60 overflow-y-auto rounded-lg border border-slate-800">
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
                  {leaves.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-900/60">
                      <td className="px-4 py-2 text-slate-100">
                        {entry.start_date} – {entry.end_date}
                      </td>
                      <td className="px-4 py-2 text-slate-100">
                        {LEAVE_TYPES.find((item) => item.value === entry.type)?.label ?? entry.type}
                      </td>
                      <td className="px-4 py-2 text-slate-300">{entry.comment || '—'}</td>
                      <td className="px-4 py-2 text-slate-100">{entry.day_count.toFixed(1)}</td>
                      <td className="px-4 py-2 text-slate-300">{entry.approved ? 'genehmigt' : 'offen'}</td>
                    </tr>
                  ))}
                  {leaves.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-3 text-center text-sm text-slate-500"
                      >
                        Keine Abwesenheiten im Zeitraum.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </aside>
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
