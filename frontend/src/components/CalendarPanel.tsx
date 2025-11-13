import clsx from 'clsx'
import dayjs, { Dayjs } from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarEvent,
  createCalendarEvent,
  deleteCalendarEvent,
  getSettings,
  listCalendarEvents,
  updateCalendarEvent,
} from '../api'
import { Lightbox } from './Lightbox'

dayjs.extend(isoWeek)

interface Props {
  refreshKey: string
}

type ViewMode = 'day' | 'week' | 'month' | 'year'
type LayoutMode = 'list' | 'week' | 'month'

type CalendarFormState = {
  title: string
  start_time: string
  end_time: string
  location: string
  description: string
  status: 'pending' | 'attended' | 'absent' | 'cancelled'
  sync_to_caldav: boolean
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: 'Offen', className: 'bg-slate-900/60 text-slate-200' },
  attended: { label: 'Teilgenommen', className: 'bg-emerald-500/10 text-emerald-300' },
  absent: { label: 'Nicht teilgenommen', className: 'bg-amber-500/10 text-amber-300' },
  cancelled: { label: 'Hinfällig', className: 'bg-rose-500/10 text-rose-300' },
}

const STATUS_OPTIONS: { value: 'pending' | 'attended' | 'absent' | 'cancelled'; label: string }[] = [
  { value: 'pending', label: STATUS_STYLES.pending.label },
  { value: 'attended', label: STATUS_STYLES.attended.label },
  { value: 'absent', label: STATUS_STYLES.absent.label },
  { value: 'cancelled', label: STATUS_STYLES.cancelled.label },
]

const VIEW_OPTIONS: { key: ViewMode; label: string }[] = [
  { key: 'day', label: 'Tag' },
  { key: 'week', label: 'Woche' },
  { key: 'month', label: 'Monat' },
  { key: 'year', label: 'Jahr' },
]

const LAYOUT_OPTIONS: { key: LayoutMode; label: string }[] = [
  { key: 'list', label: 'Liste' },
  { key: 'week', label: 'Wochenansicht' },
  { key: 'month', label: 'Monatsansicht' },
]

export function CalendarPanel({ refreshKey }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [range, setRange] = useState({
    from: dayjs().startOf('month').format('YYYY-MM-DD'),
    to: dayjs().endOf('month').format('YYYY-MM-DD'),
  })
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('list')
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [pivotDate, setPivotDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [selectedDay, setSelectedDay] = useState(dayjs().format('YYYY-MM-DD'))
  const [dayDetailsOpen, setDayDetailsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [caldavDefaultCal, setCaldavDefaultCal] = useState<string | null>(null)
  const [caldavWritable, setCaldavWritable] = useState(false)
  const buildInitialForm = useCallback<() => CalendarFormState>(
    () => ({
      title: '',
      start_time: dayjs().format('YYYY-MM-DDTHH:mm'),
      end_time: dayjs().add(1, 'hour').format('YYYY-MM-DDTHH:mm'),
      location: '',
      description: '',
      status: 'pending',
      sync_to_caldav: caldavWritable && Boolean(caldavDefaultCal),
    }),
    [caldavDefaultCal, caldavWritable],
  )
  const [form, setForm] = useState<CalendarFormState>(buildInitialForm)
  const [formOpen, setFormOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [expandedRows, setExpandedRows] = useState<number[]>([])
  const [expandedDayEventIds, setExpandedDayEventIds] = useState<number[]>([])
  const [participationUpdating, setParticipationUpdating] = useState<number | null>(null)
  const seriesCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const event of events) {
      if (!event.external_id) {
        continue
      }
      const key = `${event.calendar_identifier ?? 'manual'}::${event.external_id}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [events])
  const [deleteContext, setDeleteContext] = useState<{
    event: CalendarEvent
    seriesCount: number
  } | null>(null)
  const [deleteScope, setDeleteScope] = useState<'occurrence' | 'series'>('occurrence')
  const [deleteRemote, setDeleteRemote] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const key = dayjs(event.start_time).format('YYYY-MM-DD')
      const list = map.get(key)
      if (list) {
        list.push(event)
      } else {
        map.set(key, [event])
      }
    }
    for (const [, list] of map) {
      list.sort((a, b) => dayjs(a.start_time).valueOf() - dayjs(b.start_time).valueOf())
    }
    return map
  }, [events])
  const weekDays = useMemo(() => {
    if (layoutMode !== 'week') {
      return [] as Dayjs[]
    }
    const start = dayjs(range.from)
    return Array.from({ length: 7 }, (_, index) => start.add(index, 'day'))
  }, [layoutMode, range.from])
  const monthDays = useMemo(() => {
    if (layoutMode !== 'month') {
      return [] as Dayjs[]
    }
    const pivot = dayjs(pivotDate)
    if (!pivot.isValid()) {
      return [] as Dayjs[]
    }
    const start = pivot.startOf('month').startOf('week')
    const end = pivot.endOf('month').endOf('week')
    const days: Dayjs[] = []
    let current = start
    while (current.isBefore(end) || current.isSame(end, 'day')) {
      days.push(current)
      current = current.add(1, 'day')
    }
    return days
  }, [layoutMode, pivotDate])
  const selectedDayEvents = useMemo(
    () => eventsByDate.get(selectedDay) ?? [],
    [eventsByDate, selectedDay],
  )
  const selectedDayTitle = useMemo(() => {
    const date = dayjs(selectedDay)
    if (!date.isValid()) {
      return 'Termine'
    }
    return `Termine am ${date.format('dddd, DD.MM.YYYY')}`
  }, [selectedDay])
  const pivotMonth = useMemo(() => dayjs(pivotDate), [pivotDate])
  const todayKey = dayjs().format('YYYY-MM-DD')
  const canSyncToCaldav = caldavWritable && Boolean(caldavDefaultCal)
  const formattedRange = useMemo(
    () => `${dayjs(range.from).format('DD.MM.YYYY')} – ${dayjs(range.to).format('DD.MM.YYYY')}`,
    [range.from, range.to],
  )

  useEffect(() => {
    if (!dayDetailsOpen) {
      setExpandedDayEventIds([])
    }
  }, [dayDetailsOpen])

  useEffect(() => {
    setExpandedDayEventIds([])
  }, [selectedDay])

  useEffect(() => {
    const pivot = dayjs(pivotDate)
    if (!pivot.isValid()) {
      return
    }
    let start = pivot
    let end = pivot
    if (layoutMode === 'week') {
      start = pivot.startOf('week')
      end = pivot.endOf('week')
    } else if (layoutMode === 'month') {
      start = pivot.startOf('month').startOf('week')
      end = pivot.endOf('month').endOf('week')
    } else {
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
    }
    const nextRange = {
      from: start.format('YYYY-MM-DD'),
      to: end.format('YYYY-MM-DD'),
    }
    setRange((prev) => (prev.from === nextRange.from && prev.to === nextRange.to ? prev : nextRange))
  }, [layoutMode, pivotDate, viewMode])

  useEffect(() => {
    const pivot = dayjs(pivotDate)
    if (!pivot.isValid()) {
      return
    }
    if (layoutMode === 'month') {
      setSelectedDay((current) => {
        const currentDay = dayjs(current)
        if (currentDay.isValid() && currentDay.isSame(pivot, 'month')) {
          return current
        }
        return pivot.startOf('month').format('YYYY-MM-DD')
      })
    } else if (layoutMode === 'list') {
      setSelectedDay(pivot.format('YYYY-MM-DD'))
    }
  }, [layoutMode, pivotDate])

  const openDayDetails = (dayKey: string) => {
    setSelectedDay(dayKey)
    setDayDetailsOpen(true)
  }

  useEffect(() => {
    if (layoutMode !== 'month') {
      setDayDetailsOpen(false)
    }
  }, [layoutMode])

  useEffect(() => {
    if (layoutMode === 'month') {
      setDayDetailsOpen(false)
    }
  }, [layoutMode, pivotDate])

  const navigateRange = (direction: -1 | 1) => {
    const pivot = dayjs(pivotDate)
    if (!pivot.isValid()) {
      setPivotDate(dayjs().format('YYYY-MM-DD'))
      return
    }
    let next = pivot
    if (layoutMode === 'week') {
      next = pivot.add(direction, 'week')
    } else if (layoutMode === 'month') {
      next = pivot.add(direction, 'month')
    } else {
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
    }
    setPivotDate(next.format('YYYY-MM-DD'))
  }

  const openFormModal = useCallback(() => {
    setForm(buildInitialForm())
    setFormError(null)
    setFormOpen(true)
  }, [buildInitialForm])

  const closeFormModal = useCallback(() => {
    setForm(buildInitialForm())
    setFormError(null)
    setFormOpen(false)
  }, [buildInitialForm])

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listCalendarEvents({ from_date: range.from, to_date: range.to })
      setEvents(data)
    } catch (err) {
      console.error('Kalender konnte nicht geladen werden', err)
      setEvents([])
      setError('Kalenderdaten konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    loadEvents()
  }, [loadEvents, refreshKey])

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getSettings()
        setCaldavDefaultCal(settings.caldav_default_cal)
        setCaldavWritable(
          Boolean(settings.caldav_url && settings.caldav_user && settings.caldav_password_set),
        )
      } catch (err) {
        console.error('Einstellungen konnten nicht geladen werden', err)
      }
    }
    loadSettings()
  }, [])

  useEffect(() => {
    setExpandedRows((prev) => prev.filter((id) => events.some((event) => event.id === id)))
  }, [events])

  const handleCreateEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      await createCalendarEvent({
        title: form.title,
        start_time: form.start_time,
        end_time: form.end_time,
        location: form.location || undefined,
        description: form.description || undefined,
        status: form.status,
        participated: form.status === 'attended',
        sync_to_caldav: form.sync_to_caldav,
      })
      await loadEvents()
      setForm(buildInitialForm())
      setFormOpen(false)
    } catch (error) {
      console.error('Kalendereintrag konnte nicht gespeichert werden', error)
      setFormError('Kalendereintrag konnte nicht gespeichert werden.')
    } finally {
      setSubmitting(false)
    }
  }

  const updateStatus = async (
    eventId: number,
    status: 'pending' | 'attended' | 'absent' | 'cancelled',
  ) => {
    setParticipationUpdating(eventId)
    setError(null)
    try {
      await updateCalendarEvent(eventId, { status })
      await loadEvents()
    } catch (err) {
      console.error('Kalenderstatus konnte nicht gespeichert werden', err)
      setError('Kalenderstatus konnte nicht aktualisiert werden.')
    } finally {
      setParticipationUpdating(null)
    }
  }

  const toggleDetails = (eventId: number) => {
    setExpandedRows((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId],
    )
  }

  const toggleDayEventDetails = (eventId: number) => {
    setExpandedDayEventIds((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId],
    )
  }

  const openDeleteDialog = useCallback(
    (event: CalendarEvent) => {
      const seriesKey = event.external_id
        ? `${event.calendar_identifier ?? 'manual'}::${event.external_id}`
        : null
      const occurrences = seriesKey ? seriesCounts.get(seriesKey) ?? 1 : 1
      setDeleteContext({ event, seriesCount: occurrences })
      setDeleteScope(occurrences > 1 || Boolean(event.recurrence_id) ? 'occurrence' : 'series')
      setDeleteRemote(false)
      setDeleteError(null)
      setDeleteSubmitting(false)
    },
    [seriesCounts],
  )

  const closeDeleteDialog = useCallback(() => {
    setDeleteContext(null)
    setDeleteError(null)
    setDeleteSubmitting(false)
    setDeleteRemote(false)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleteContext) {
      return
    }
    setDeleteSubmitting(true)
    setDeleteError(null)
    try {
      await deleteCalendarEvent(deleteContext.event.id, {
        scope: deleteScope,
        delete_remote: deleteRemote,
      })
      await loadEvents()
      closeDeleteDialog()
    } catch (error) {
      console.error('Kalendereintrag konnte nicht gelöscht werden', error)
      setDeleteError('Kalendereintrag konnte nicht gelöscht werden.')
    } finally {
      setDeleteSubmitting(false)
    }
  }, [closeDeleteDialog, deleteContext, deleteRemote, deleteScope, loadEvents])

  const renderStatusActions = (event: CalendarEvent) => (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => updateStatus(event.id, 'attended')}
        disabled={participationUpdating === event.id}
        className={clsx(
          'rounded-md border px-2 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-60',
          event.status === 'attended'
            ? 'border-emerald-400 text-emerald-300'
            : 'border-slate-700 text-slate-200 hover:border-primary hover:text-primary',
        )}
      >
        Teilgenommen
      </button>
      <button
        type="button"
        onClick={() => updateStatus(event.id, 'absent')}
        disabled={participationUpdating === event.id}
        className={clsx(
          'rounded-md border px-2 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-60',
          event.status === 'absent'
            ? 'border-amber-400 text-amber-300'
            : 'border-slate-700 text-slate-200 hover:border-primary hover:text-primary',
        )}
      >
        Nicht teilgenommen
      </button>
      <button
        type="button"
        onClick={() => updateStatus(event.id, 'cancelled')}
        disabled={participationUpdating === event.id}
        className={clsx(
          'rounded-md border px-2 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-60',
          event.status === 'cancelled'
            ? 'border-rose-400 text-rose-300'
            : 'border-slate-700 text-slate-200 hover:border-primary hover:text-primary',
        )}
      >
        Hinfällig
      </button>
      {event.status !== 'pending' && (
        <button
          type="button"
          onClick={() => updateStatus(event.id, 'pending')}
          disabled={participationUpdating === event.id}
          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          Zurücksetzen
        </button>
      )}
      <button
        type="button"
        onClick={() => openDeleteDialog(event)}
        className="rounded-md border border-rose-500/60 px-2 py-1 text-xs text-rose-300 transition hover:border-rose-400 hover:text-rose-200"
      >
        Löschen
      </button>
    </div>
  )

  const deleteTargetEvent = deleteContext?.event
  const deleteSeriesCandidate =
    deleteContext != null &&
    (deleteContext.seriesCount > 1 || Boolean(deleteContext.event.recurrence_id))
  const deleteRemoteAvailable =
    deleteContext != null &&
    Boolean(
      deleteContext.event.external_id &&
        deleteContext.event.calendar_identifier &&
        deleteContext.event.calendar_identifier !== 'manual',
    )

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Kalenderübersicht</h2>
          <p className="text-sm text-slate-400">
            Umschaltbare Tages-, Wochen-, Monats- oder Jahresansicht und direkte Statuspflege für Termine.
          </p>
          <p className="mt-1 text-xs text-slate-500">Zeitraum: {formattedRange}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-md border border-slate-800">
            {LAYOUT_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setLayoutMode(option.key)}
                className={clsx(
                  'px-3 py-1 text-xs font-medium transition-colors',
                  layoutMode === option.key
                    ? 'bg-primary text-slate-950'
                    : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {layoutMode === 'list' && (
            <div className="inline-flex overflow-hidden rounded-md border border-slate-800">
              {VIEW_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setViewMode(option.key)}
                  className={clsx(
                    'px-3 py-1 text-xs font-medium transition-colors',
                    viewMode === option.key
                      ? 'bg-primary text-slate-950'
                      : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigateRange(-1)}
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
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
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
            >
              →
            </button>
          </div>
          <button
            type="button"
            onClick={openFormModal}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
          >
            Neuen Termin anlegen
          </button>
        </div>
      </div>
      <Lightbox
        open={formOpen}
        onClose={closeFormModal}
        title="Neuen Termin anlegen"
        footer={
          <button
            type="submit"
            form="calendar-create-event"
            disabled={submitting}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
          >
            Termin speichern
          </button>
        }
      >
        <form
          id="calendar-create-event"
          className="grid gap-4 md:grid-cols-2"
          onSubmit={handleCreateEvent}
        >
          {formError && <p className="md:col-span-2 text-sm text-rose-300">{formError}</p>}
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
            Beginn
            <input
              type="datetime-local"
              value={form.start_time}
              onChange={(event) => setForm((prev) => ({ ...prev, start_time: event.target.value }))}
              required
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-sm text-slate-300">
            Ende
            <input
              type="datetime-local"
              value={form.end_time}
              onChange={(event) => setForm((prev) => ({ ...prev, end_time: event.target.value }))}
              required
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-sm text-slate-300">
            Ort
            <input
              type="text"
              value={form.location}
              onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
              placeholder="optional"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-sm text-slate-300 md:col-span-2">
            Beschreibung
            <textarea
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              rows={3}
              placeholder="optional"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-sm text-slate-300">
            Status
            <select
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  status: event.target.value as CalendarFormState['status'],
                }))
              }
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2">
            <label
              className={clsx(
                'inline-flex items-center gap-3 text-sm text-slate-300',
                !canSyncToCaldav && 'text-slate-500',
              )}
            >
              <input
                type="checkbox"
                checked={form.sync_to_caldav}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sync_to_caldav: event.target.checked }))
                }
                disabled={!canSyncToCaldav}
                className="h-4 w-4 rounded border border-slate-600 text-primary focus:ring-primary"
              />
              Termin in CalDAV-Standardkalender übernehmen
            </label>
            <p className="mt-1 text-xs text-slate-500">
              {canSyncToCaldav
                ? `Standardkalender: ${caldavDefaultCal ?? 'unbekannt'}`
                : 'Kein CalDAV-Standardkalender konfiguriert.'}
            </p>
          </div>
        </form>
      </Lightbox>
      <Lightbox
        open={Boolean(deleteContext)}
        onClose={() => {
          if (!deleteSubmitting) {
            closeDeleteDialog()
          }
        }}
        title="Kalendereintrag löschen"
        footer={
          <>
            <button
              type="button"
              onClick={closeDeleteDialog}
              disabled={deleteSubmitting}
              className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => {
                if (!deleteSubmitting) {
                  void confirmDelete()
                }
              }}
              disabled={deleteSubmitting}
              className="rounded-md border border-rose-500/70 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-400 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Termin löschen
            </button>
          </>
        }
      >
        {deleteTargetEvent ? (
          <>
            <p className="text-sm text-slate-300">
              Sollen der Termin{' '}
              <span className="font-semibold text-slate-100">{deleteTargetEvent.title}</span> am{' '}
              {dayjs(deleteTargetEvent.start_time).format('DD.MM.YYYY HH:mm')} gelöscht werden?
            </p>
            {deleteSeriesCandidate ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Serienauswahl</p>
                <div className="mt-2 space-y-2 text-sm text-slate-200">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="delete-scope"
                      value="occurrence"
                      checked={deleteScope === 'occurrence'}
                      onChange={() => setDeleteScope('occurrence')}
                      disabled={deleteSubmitting}
                      className="h-4 w-4 border border-slate-600 text-primary focus:ring-primary"
                    />
                    Nur dieses Vorkommen entfernen
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="delete-scope"
                      value="series"
                      checked={deleteScope === 'series'}
                      onChange={() => setDeleteScope('series')}
                      disabled={deleteSubmitting}
                      className="h-4 w-4 border border-slate-600 text-primary focus:ring-primary"
                    />
                    Komplette Serie entfernen
                  </label>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Dieser Termin gehört zu keiner Serie und wird vollständig gelöscht.
              </p>
            )}
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">CalDAV</p>
              {deleteRemoteAvailable ? (
                <label className="mt-2 flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={deleteRemote}
                    onChange={(event) => setDeleteRemote(event.target.checked)}
                    disabled={deleteSubmitting}
                    className="h-4 w-4 rounded border border-slate-600 text-primary focus:ring-primary"
                  />
                  Auch im CalDAV-Kalender {deleteTargetEvent.calendar_identifier} entfernen
                </label>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Termin ist nur lokal vorhanden und wird ausschließlich hier gelöscht.
                </p>
              )}
            </div>
            {deleteError && (
              <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {deleteError}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-300">Kein Termin ausgewählt.</p>
        )}
      </Lightbox>
      <Lightbox
        open={layoutMode === 'month' && dayDetailsOpen}
        onClose={() => setDayDetailsOpen(false)}
        title={selectedDayTitle}
        contentClassName="space-y-4"
      >
        {selectedDayEvents.length === 0 ? (
          <p className="text-sm text-slate-400">Keine Termine an diesem Tag.</p>
        ) : (
          <ul className="space-y-3">
            {selectedDayEvents.map((event) => {
              const isExpanded = expandedDayEventIds.includes(event.id)
              return (
                <li
                  key={event.id}
                  className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-200"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-100">{event.title}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {dayjs(event.start_time).format('HH:mm')} – {dayjs(event.end_time).format('HH:mm')}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {event.calendar_identifier && event.calendar_identifier !== 'manual'
                          ? `CalDAV: ${event.calendar_identifier}`
                          : 'Lokal'}
                      </p>
                      {event.location && <p className="text-xs text-slate-400">Ort: {event.location}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={clsx(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                          STATUS_STYLES[event.status]?.className ?? STATUS_STYLES.pending.className,
                        )}
                      >
                        {STATUS_STYLES[event.status]?.label ?? STATUS_STYLES.pending.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleDayEventDetails(event.id)}
                        className="rounded-md border border-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:border-primary hover:text-primary"
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? 'Weniger' : 'Details'}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                      {event.description ? (
                        <p className="whitespace-pre-wrap text-xs text-slate-300">{event.description}</p>
                      ) : (
                        <p className="text-xs italic text-slate-500">Keine Beschreibung vorhanden.</p>
                      )}
                    </div>
                  )}
                  <div className="mt-3">{renderStatusActions(event)}</div>
                </li>
              )
            })}
          </ul>
        )}
      </Lightbox>
      <div className="mt-6 space-y-4">
        {error && !loading && (
          <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{error}</p>
        )}
        {loading ? (
          <p className="text-sm text-slate-400">Lade Termine…</p>
        ) : layoutMode === 'list' ? (
          <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2 text-left">Termin</th>
                  <th className="px-4 py-2 text-left">Zeitraum</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-center text-sm text-slate-400">
                      Keine Termine im Zeitraum.
                    </td>
                  </tr>
                ) : (
                  events.map((event) => {
                    const isExpanded = expandedRows.includes(event.id)
                    return (
                      <Fragment key={event.id}>
                        <tr className="hover:bg-slate-900/70">
                          <td className="px-4 py-2 text-slate-100">
                            <div className="font-medium">{event.title}</div>
                          </td>
                          <td className="px-4 py-2 text-slate-200">
                            {dayjs(event.start_time).format('DD.MM.YYYY HH:mm')} –{' '}
                            {dayjs(event.end_time).format('DD.MM.YYYY HH:mm')}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex flex-col gap-2">
                              <span
                                className={clsx(
                                  'inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                  STATUS_STYLES[event.status]?.className ?? STATUS_STYLES.pending.className,
                                )}
                              >
                                {STATUS_STYLES[event.status]?.label ?? STATUS_STYLES.pending.label}
                              </span>
                              {renderStatusActions(event)}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <button
                              type="button"
                              onClick={() => toggleDetails(event.id)}
                              className="text-xs text-primary hover:underline"
                            >
                              {isExpanded ? 'Details verbergen' : 'Details anzeigen'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${event.id}-details`} className="bg-slate-900/50">
                            <td colSpan={4} className="px-4 py-3 text-sm text-slate-200">
                              <div className="space-y-3">
                                {event.description && (
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-slate-500">Beschreibung</p>
                                    <p className="text-slate-300">{event.description}</p>
                                  </div>
                                )}
                                {event.location && (
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-slate-500">Ort</p>
                                    <p className="text-slate-300">{event.location}</p>
                                  </div>
                                )}
                                {event.attendees.length > 0 && (
                                  <div>
                                    <p className="text-xs uppercase tracking-wide text-slate-500">Teilnehmer</p>
                                    <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-300">
                                      {event.attendees.map((attendee) => (
                                        <li key={attendee}>{attendee}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-slate-500">Quelle</p>
                                  <p className="text-slate-300">
                                    {event.calendar_identifier && event.calendar_identifier !== 'manual'
                                      ? `CalDAV (${event.calendar_identifier})`
                                      : 'Lokal'}
                                  </p>
                                </div>
                                {!event.description && !event.location && event.attendees.length === 0 && (
                                  <p className="text-xs text-slate-500">Keine zusätzlichen Details vorhanden.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : layoutMode === 'week' ? (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  {weekDays.map((day) => (
                    <th key={day.format('YYYY-MM-DD')} className="px-4 py-2 text-left">
                      {day.format('ddd, DD.MM.')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {weekDays.map((day) => {
                    const dayKey = day.format('YYYY-MM-DD')
                    const dayEvents = eventsByDate.get(dayKey) ?? []
                    return (
                      <td key={dayKey} className="align-top px-4 py-3">
                        {dayEvents.length === 0 ? (
                          <p className="text-xs text-slate-500">Keine Termine</p>
                        ) : (
                          <div className="space-y-3">
                            {dayEvents.map((event) => (
                              <div key={event.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                                <p className="text-sm font-semibold text-slate-100">{event.title}</p>
                                <p className="text-xs text-slate-400">
                                  {dayjs(event.start_time).format('HH:mm')} – {dayjs(event.end_time).format('HH:mm')}
                                </p>
                                <span
                                  className={clsx(
                                    'mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                                    STATUS_STYLES[event.status]?.className ?? STATUS_STYLES.pending.className,
                                  )}
                                >
                                  {STATUS_STYLES[event.status]?.label ?? STATUS_STYLES.pending.label}
                                </span>
                                <p className="mt-1 text-[11px] text-slate-500">
                                  {event.calendar_identifier && event.calendar_identifier !== 'manual'
                                    ? `CalDAV: ${event.calendar_identifier}`
                                    : 'Lokal'}
                                </p>
                                {event.location && (
                                  <p className="mt-1 text-xs text-slate-400">Ort: {event.location}</p>
                                )}
                                <div className="mt-2">{renderStatusActions(event)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-7 gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              {monthDays.map((day) => {
                const dayKey = day.format('YYYY-MM-DD')
                const isCurrentMonth = pivotMonth.isValid() && day.isSame(pivotMonth, 'month')
                const isSelected = dayKey === selectedDay
                const hasEvents = (eventsByDate.get(dayKey) ?? []).length > 0
                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={() => openDayDetails(dayKey)}
                    className={clsx(
                      'rounded-lg border px-2 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-primary/40',
                      isCurrentMonth
                        ? 'border-slate-800 bg-slate-950/60 text-slate-100'
                        : 'border-slate-900 bg-slate-950/30 text-slate-500',
                      isSelected && 'border-primary text-primary shadow',
                      dayKey === todayKey && 'ring-1 ring-primary/40',
                    )}
                  >
                    <span className="text-sm font-semibold">{day.date()}</span>
                    <span className="block text-[11px] text-slate-500">{day.format('dd')}</span>
                    {hasEvents && <span className="mt-2 inline-block h-1.5 w-1.5 rounded-full bg-primary" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
