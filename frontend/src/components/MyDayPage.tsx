import dayjs from 'dayjs'
import { WorkSession, TimeDisplayFormat } from '../api'
import { SessionList } from './SessionList'
import { TodayCalendarList } from './TodayCalendarList'

interface Props {
  refreshKey: string
  timeDisplayFormat: TimeDisplayFormat
  onSessionStart: (options?: { start_time?: string; comment?: string }) => Promise<void>
  onPauseToggle: () => Promise<void>
  onSessionStop: (comment?: string) => Promise<void>
  activeSession: WorkSession | null
}

export function MyDayPage({
  refreshKey,
  timeDisplayFormat,
  onSessionStart,
  onPauseToggle,
  onSessionStop,
  activeSession,
}: Props) {
  const today = dayjs().format('YYYY-MM-DD')

  return (
    <div className="space-y-6 xl:space-y-8">
      <div className="grid gap-6 xl:grid-cols-[2.2fr,1fr] xl:items-start">
        <div className="space-y-6">
          <SessionList
            refreshKey={refreshKey}
            timeDisplayFormat={timeDisplayFormat}
            onSessionStart={onSessionStart}
            onPauseToggle={onPauseToggle}
            onSessionStop={onSessionStop}
            activeSession={activeSession}
          />
        </div>
        <aside className="xl:sticky xl:top-24">
          <TodayCalendarList day={today} refreshKey={refreshKey} />
        </aside>
      </div>
    </div>
  )
}
