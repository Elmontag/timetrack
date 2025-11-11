import dayjs from 'dayjs'
import { WorkSession } from '../api'
import { SessionControls } from './SessionControls'
import { SubtrackManager } from './SubtrackManager'
import { TodayCalendarList } from './TodayCalendarList'

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
    <div className="space-y-6 xl:space-y-8">
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
      <div className="grid gap-6 xl:grid-cols-[2.2fr,1fr] xl:items-start">
        <div className="space-y-6">
          <SubtrackManager day={today} refreshKey={refreshKey} />
        </div>
        <aside className="xl:sticky xl:top-24">
          <TodayCalendarList day={today} refreshKey={refreshKey} />
        </aside>
      </div>
    </div>
  )
}
