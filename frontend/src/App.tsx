import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { API_BASE } from './config'
import {
  getSessionsForDay,
  WorkSession,
} from './api'
import { SessionControls } from './components/SessionControls'
import { SessionList } from './components/SessionList'
import { DaySummaryPanel } from './components/DaySummaryPanel'
import { LeaveManager } from './components/LeaveManager'
import { ExportPanel } from './components/ExportPanel'

export default function App() {
  const [activeSession, setActiveSession] = useState<WorkSession | null>(null)
  const [refreshKey, setRefreshKey] = useState(() => Date.now().toString())
  const triggerRefresh = () => setRefreshKey(Date.now().toString())

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">TimeTrack</h1>
            <p className="text-sm text-slate-400">Deine persönliche Stempeluhr – schnell, sicher und offline-freundlich.</p>
          </div>
          <div className="flex flex-col items-start gap-1 text-sm text-slate-400 md:items-end">
            <span>Status: <span className="font-medium text-slate-100">{currentStatus}</span></span>
            <span>API: {API_BASE}</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <SessionControls
          activeSession={activeSession}
          onUpdate={(session) => {
            setActiveSession(session)
            triggerRefresh()
          }}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <SessionList refreshKey={refreshKey} />
          <DaySummaryPanel refreshKey={refreshKey} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <LeaveManager refreshKey={refreshKey} onRefreshed={triggerRefresh} />
          <ExportPanel onExported={() => triggerRefresh()} />
        </div>
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
