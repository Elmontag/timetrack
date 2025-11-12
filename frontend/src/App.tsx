import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import clsx from 'clsx'
import { API_BASE } from './config'
import {
  DaySummary,
  SettingsResponse,
  TimeDisplayFormat,
  getDaySummaries,
  getSessionsForDay,
  getSettings,
  pauseSession,
  createSessionNote,
  startSession,
  stopSession,
  WorkSession,
} from './api'
import { SessionList } from './components/SessionList'
import { DaySummaryPanel } from './components/DaySummaryPanel'
import { LeaveManager } from './components/LeaveManager'
import { ExportPanel } from './components/ExportPanel'
import { ManualEntryForm } from './components/ManualEntryForm'
import { CalendarPanel } from './components/CalendarPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { PermalinkLightbox } from './components/PermalinkLightbox'
import { MyDayPage } from './components/MyDayPage'
import { HeaderSessionBar } from './components/HeaderSessionBar'
import { ThemeToggle, ThemeMode } from './components/ThemeToggle'
import { TravelManager } from './components/TravelManager'
import { useAsync } from './hooks/useAsync'

export default function App() {
  const [activeSession, setActiveSession] = useState<WorkSession | null>(null)
  const [refreshKey, setRefreshKey] = useState(() => Date.now().toString())
  const [activeTab, setActiveTab] = useState<
    'myday' | 'work' | 'leave' | 'calendar' | 'travel' | 'exports' | 'settings'
  >('myday')
  const [workView, setWorkView] = useState<'log' | 'manual' | 'analysis'>('log')
  const [startPlan, setStartPlan] = useState(() => ({
    startTime: dayjs().format('YYYY-MM-DDTHH:mm'),
    comment: '',
    noteTimestamp: null as string | null,
  }))
  const [currentDay, setCurrentDay] = useState(() => dayjs().format('YYYY-MM-DD'))
  const [daySummary, setDaySummary] = useState<DaySummary | null>(null)
  const [permalinkOpen, setPermalinkOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'dark'
    const stored = window.localStorage.getItem('tt-theme')
    const initial = stored === 'light' ? 'light' : 'dark'
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = initial
    }
    return initial
  })
  const [dayOverviewRefreshSeconds, setDayOverviewRefreshSeconds] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('tt-day-overview-refresh')
      const parsed = stored ? Number(stored) : NaN
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed
      }
    }
    return 1
  })
  const [timeDisplayFormat, setTimeDisplayFormat] = useState<TimeDisplayFormat>('hh:mm')

  const triggerRefresh = useCallback(() => setRefreshKey(Date.now().toString()), [])
  const { run: runStart, loading: starting } = useAsync(startSession)
  const { run: runPause, loading: pausing } = useAsync(pauseSession)
  const { run: runStop, loading: stopping } = useAsync(stopSession)

  useEffect(() => {
    const init = async () => {
      const today = dayjs().format('YYYY-MM-DD')
      const sessions = await getSessionsForDay(today)
      const current = sessions.find((session) => ['active', 'paused'].includes(session.status)) ?? null
      setActiveSession(current)
    }
    init()
  }, [])

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await getSettings()
        if (data.day_overview_refresh_seconds > 0) {
          setDayOverviewRefreshSeconds(data.day_overview_refresh_seconds)
        }
        if (data.time_display_format) {
          setTimeDisplayFormat(data.time_display_format)
        }
      } catch (error) {
        console.error('Einstellungen konnten nicht geladen werden', error)
      }
    }
    loadSettings()
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('tt-day-overview-refresh', dayOverviewRefreshSeconds.toString())
    }
  }, [dayOverviewRefreshSeconds])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    const handler = (event: Event) => {
      const custom = event as CustomEvent<SettingsResponse>
      const value = custom.detail?.day_overview_refresh_seconds
      if (typeof value === 'number' && value > 0) {
        setDayOverviewRefreshSeconds(value)
      }
      const format = custom.detail?.time_display_format
      if (format === 'hh:mm' || format === 'decimal') {
        setTimeDisplayFormat(format)
      }
    }
    window.addEventListener('tt-settings-updated', handler as EventListener)
    return () => window.removeEventListener('tt-settings-updated', handler as EventListener)
  }, [])

  useEffect(() => {
    if (!activeSession) return
    const intervalSeconds = Number.isFinite(dayOverviewRefreshSeconds)
      ? Math.max(1, dayOverviewRefreshSeconds)
      : 60
    const timer = window.setInterval(() => {
      setRefreshKey(Date.now().toString())
    }, intervalSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [activeSession, dayOverviewRefreshSeconds])

  const loadSummary = useCallback(async () => {
    const today = dayjs().format('YYYY-MM-DD')
    setCurrentDay(today)
    try {
      const data = await getDaySummaries(today, today)
      setDaySummary(data[0] ?? null)
    } catch (error) {
      console.error('Tagesübersicht konnte nicht geladen werden', error)
      setDaySummary(null)
    }
  }, [])

  useEffect(() => {
    loadSummary()
  }, [loadSummary, refreshKey])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('tt-theme', theme)
    }
  }, [theme])

  const handleStart = useCallback(
    async (override?: { start_time?: string; comment?: string }) => {
      const payload: { start_time?: string; comment?: string } = {}
      const rawStart = override?.start_time ?? startPlan.startTime
      const rawComment = override?.comment ?? startPlan.comment
      if (rawStart) {
        payload.start_time = rawStart.endsWith('Z') ? rawStart : dayjs(rawStart).toISOString()
      }
      if (rawComment && rawComment.trim()) {
        payload.comment = rawComment.trim()
      }
      const session = await runStart(payload)
      let nextSession: WorkSession = session
      const plannedNote = startPlan.comment.trim()
      if (plannedNote) {
        const plannedTimestamp = startPlan.noteTimestamp
        const noteCreatedAt = plannedTimestamp
          ? plannedTimestamp.endsWith('Z')
            ? plannedTimestamp
            : dayjs(plannedTimestamp).toISOString()
          : dayjs().toISOString()
        try {
          const note = await createSessionNote(session.id, {
            content: plannedNote,
            note_type: 'start',
            created_at: noteCreatedAt,
          })
          const existingNotes = Array.isArray(session.notes) ? session.notes : []
          nextSession = { ...session, comment: note.content, notes: [...existingNotes, note] }
        } catch (error) {
          console.error('Startnotiz konnte nicht gespeichert werden', error)
        }
      }
      setActiveSession(nextSession)
      setStartPlan({
        startTime: dayjs().format('YYYY-MM-DDTHH:mm'),
        comment: '',
        noteTimestamp: null,
      })
      triggerRefresh()
    },
    [runStart, startPlan, triggerRefresh],
  )

  const handlePauseToggle = useCallback(async () => {
    const result = await runPause()
    setActiveSession(result.session)
    triggerRefresh()
  }, [runPause, triggerRefresh])

  const handleStop = useCallback(
    async (comment?: string) => {
      const payload: { comment?: string } = {}
      if (comment && comment.trim()) {
        payload.comment = comment.trim()
      }
      await runStop(payload)
      setActiveSession(null)
      triggerRefresh()
    },
    [runStop, triggerRefresh],
  )

  const activeSessionId = activeSession?.id

  const handleRuntimeNote = useCallback(
    async (content: string, createdAt?: string) => {
      if (!activeSessionId) {
        return
      }
      const trimmed = content.trim()
      if (!trimmed) {
        return
      }
      const iso = createdAt
        ? createdAt.endsWith('Z')
          ? createdAt
          : dayjs(createdAt).toISOString()
        : dayjs().toISOString()
      try {
        const note = await createSessionNote(activeSessionId, {
          content: trimmed,
          note_type: 'runtime',
          created_at: iso,
        })
        setActiveSession((prev) => {
          if (!prev || prev.id !== activeSessionId) {
            return prev
          }
          const existingNotes = Array.isArray(prev.notes) ? prev.notes : []
          return { ...prev, comment: note.content, notes: [...existingNotes, note] }
        })
        triggerRefresh()
      } catch (error) {
        console.error('Notiz konnte nicht gespeichert werden', error)
        throw error
      }
    },
    [activeSessionId, triggerRefresh],
  )

  const content = useMemo(() => {
    switch (activeTab) {
      case 'myday':
        return <MyDayPage refreshKey={refreshKey} />
      case 'work':
        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Arbeitszeit</h2>
                <p className="text-sm text-slate-400">Protokoll, Nachträge und Auswertungen.</p>
              </div>
              <div className="inline-flex overflow-hidden rounded-md border border-slate-800">
                {(
                  [
                    { key: 'log', label: 'Protokoll' },
                    { key: 'manual', label: 'Arbeitszeit nachtragen' },
                    { key: 'analysis', label: 'Monat/Woche/Jahr' },
                  ] as { key: typeof workView; label: string }[]
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setWorkView(option.key)}
                    className={`px-3 py-1 text-xs font-medium transition-colors ${
                      workView === option.key ? 'bg-primary text-slate-950' : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {workView === 'log' && (
              <SessionList refreshKey={refreshKey} timeDisplayFormat={timeDisplayFormat} />
            )}
            {workView === 'manual' && <ManualEntryForm onCreated={triggerRefresh} />}
            {workView === 'analysis' && (
              <DaySummaryPanel refreshKey={refreshKey} timeDisplayFormat={timeDisplayFormat} />
            )}
          </div>
        )
      case 'leave':
        return <LeaveManager refreshKey={refreshKey} onRefreshed={triggerRefresh} />
      case 'calendar':
        return <CalendarPanel refreshKey={refreshKey} />
      case 'travel':
        return <TravelManager />
      case 'exports':
        return <ExportPanel onExported={() => triggerRefresh()} />
      case 'settings':
        return <SettingsPanel />
      default:
        return null
    }
  }, [activeTab, refreshKey, timeDisplayFormat, triggerRefresh, workView])

  return (
    <div
      className={clsx(
        'min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 transition-colors',
        theme === 'light' && 'text-slate-900',
      )}
    >
      <header className="border-b border-slate-800 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto max-w-7xl space-y-6 px-6 py-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-100">TimeTrack</h1>
              <p className="text-sm text-slate-400">
                Deine persönliche Stempeluhr – schnell, sicher und offline-freundlich.
              </p>
            </div>
            <div className="flex flex-col gap-2 text-sm text-slate-400 md:items-end">
              <div className="flex items-center gap-3">
                <ThemeToggle theme={theme} onToggle={(mode) => setTheme(mode)} />
                <span>API: {API_BASE}</span>
              </div>
              <p className="mt-1">Heute: {dayjs().format('DD.MM.YYYY')}</p>
            </div>
          </div>
          <HeaderSessionBar
            activeSession={activeSession}
            onStart={() => handleStart()}
            onPauseToggle={handlePauseToggle}
            onStop={handleStop}
            loading={{ start: starting, pause: pausing, stop: stopping }}
            startPlan={startPlan}
            onStartPlanChange={setStartPlan}
            day={currentDay}
            summary={daySummary}
            onRuntimeNoteCreate={handleRuntimeNote}
            timeDisplayFormat={timeDisplayFormat}
          />
          <nav className="flex flex-wrap gap-2">
            {[
              { key: 'myday', label: 'Mein Tag' },
              { key: 'work', label: 'Arbeitszeit' },
              { key: 'leave', label: 'Abwesenheiten' },
              { key: 'calendar', label: 'Kalender' },
              { key: 'travel', label: 'Dienstreisen' },
              { key: 'exports', label: 'Exporte' },
              { key: 'settings', label: 'Einstellungen' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as typeof activeTab)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-primary text-slate-950 shadow'
                    : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800'
                }`}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {content}
      </main>
      <footer className="border-t border-slate-800 bg-slate-950/80">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-6 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>TimeTrack MVP © {new Date().getFullYear()}</span>
          <button
            type="button"
            onClick={() => setPermalinkOpen(true)}
            className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-primary hover:text-primary"
          >
            Permalink-Aktionen öffnen
          </button>
          <span>Made for Selbsthosting – Daten bleiben bei dir.</span>
        </div>
      </footer>
      <PermalinkLightbox open={permalinkOpen} onClose={() => setPermalinkOpen(false)} />
    </div>
  )
}
