import dayjs from 'dayjs'
import { WorkSession } from '../api'
import { SessionControls } from './SessionControls'
import { SessionTimerDisplay } from './SessionTimerDisplay'
import { SubtrackManager } from './SubtrackManager'
import { TodayCalendarList } from './TodayCalendarList'
import { TodaySummary } from './TodaySummary'

interface Props {
  activeSession: WorkSession | null
  startConfig: { startTime: string; comment: string }
  onStartConfigChange: (config: { startTime: string; comment: string }) => void
  onStart: (override?: { start_time?: string; comment?: string }) => Promise<void>
  onStop: (comment?: string) => Promise<void>
  refreshKey: string
  triggerRefresh: () => void
}

export function MyDayPage({
  activeSession,
  startConfig,
  onStartConfigChange,
  onStart,
  onStop,
  refreshKey,
  triggerRefresh,
}: Props) {
  const today = dayjs().format('YYYY-MM-DD')

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <SessionControls
          activeSession={activeSession}
          startConfig={startConfig}
          onStartConfigChange={onStartConfigChange}
          onStart={async (payload) => {
            await onStart(payload)
            triggerRefresh()
          }}
          onStop={async (comment) => {
            await onStop(comment)
            triggerRefresh()
          }}
        />
        <SessionTimerDisplay session={activeSession} />
      </div>
      <TodaySummary day={today} refreshKey={refreshKey} />
      <div className="grid gap-6 lg:grid-cols-2">
        <TodayCalendarList day={today} refreshKey={refreshKey} />
        <SubtrackManager day={today} refreshKey={refreshKey} />
      </div>
    </div>
  )
}
