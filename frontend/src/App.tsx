import { useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { API_BASE } from './config'
import { getSessionsForDay, WorkSession } from './api'
import { SessionControls } from './components/SessionControls'
import { SessionList } from './components/SessionList'
import { DaySummaryPanel } from './components/DaySummaryPanel'
import { LeaveManager } from './components/LeaveManager'
import { ExportPanel } from './components/ExportPanel'
import { ManualEntryForm } from './components/ManualEntryForm'
import { CalendarPanel } from './components/CalendarPanel'
import { SettingsPanel } from './components/SettingsPanel'

export default function App() {
  const [activeSession, setActiveSession] = useState<WorkSession | null>(null)
  const [refreshKey, setRefreshKey] = useState(() => Date.now().toString())
  const [activeTab, setActiveTab] = useState<'dashboard' | 'leave' | 'calendar' | 'exports' | 'settings'>('dashboard')
  const triggerRefresh = useCallback(() => setRefreshKey(Date.now().toString()), [])

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
    if (!activeSession) return
    const timer = window.setInterval(() => {
      setRefreshKey(Date.now().toString())
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [activeSession])

  const currentStatus = useMemo(() => {
    if (!activeSession) return 'Bereit'
    return activeSession.status === 'paused' ? 'Pausiert' : 'Laufend'
  }, [activeSession])

  const content = useMemo(() => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-6">
            <SessionControls
              activeSession={activeSession}
              onUpdate={(session) => {
                setActiveSession(session)
                triggerRefresh()
              }}
            />
            <ManualEntryForm onCreated={triggerRefresh} />
            <div className="grid gap-6 lg:grid-cols-2">
              <SessionList refreshKey={refreshKey} />
              <DaySummaryPanel refreshKey={refreshKey} />
            </div>
          </div>
        )
      case 'leave':
        return <LeaveManager refreshKey={refreshKey} onRefreshed={triggerRefresh} />
      case 'calendar':
        return <CalendarPanel refreshKey={refreshKey} />
      case 'exports':
        return <ExportPanel onExported={() => triggerRefresh()} />
      case 'settings':
        return <SettingsPanel />
      default:
        return null
    }
  }, [activeTab, activeSession, refreshKey, triggerRefresh])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">TimeTrack</h1>
            <p className="text-sm text-slate-400">Deine persönliche Stempeluhr – schnell, sicher und offline-freundlich.</p>
          </div>
          <div className="flex flex-col items-start gap-1 text-sm text-slate-400 md:items-end">
            <span>Status: <span className="font-medium text-slate-100">{currentStatus}</span></span>
            <span>API: {API_BASE}</span>
          </div>
        </div>
        <nav className="mx-auto mt-2 flex max-w-6xl flex-wrap gap-2 px-6 pb-4">
          {[
            { key: 'dashboard', label: 'Arbeitszeit' },
            { key: 'leave', label: 'Abwesenheiten' },
            { key: 'calendar', label: 'Kalender' },
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
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {content}
      </main>
      <footer className="border-t border-slate-800 bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-2 px-6 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>TimeTrack MVP © {new Date().getFullYear()}</span>
          <span>Made for Selbsthosting – Daten bleiben bei dir.</span>
        </div>
      </footer>
    </div>
  )
}
