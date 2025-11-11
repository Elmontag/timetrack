import dayjs from 'dayjs'
import { WorkSession } from '../api'
import { SessionControls } from './SessionControls'
import { SessionTimerDisplay } from './SessionTimerDisplay'
import { SubtrackManager } from './SubtrackManager'
import { TodayCalendarList } from './TodayCalendarList'
import { TodaySummary } from './TodaySummary'

interface Props {
  activeSession: WorkSession | null
  onSessionUpdate: (session: WorkSession | null) => void
  refreshKey: string
  triggerRefresh: () => void
}

export function MyDayPage({ activeSession, onSessionUpdate, refreshKey, triggerRefresh }: Props) {
  const today = dayjs().format('YYYY-MM-DD')

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <SessionControls
          activeSession={activeSession}
          onUpdate={(session) => {
            onSessionUpdate(session)
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
