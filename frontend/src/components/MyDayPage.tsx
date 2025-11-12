import dayjs from 'dayjs'
import { TimeDisplayFormat, WorkSession } from '../api'
import { SubtrackManager } from './SubtrackManager'
import { TodayCalendarList } from './TodayCalendarList'

interface Props {
  refreshKey: string
  activeSession: WorkSession | null
  onRefresh: () => void
  timeDisplayFormat: TimeDisplayFormat
}

export function MyDayPage({ refreshKey, activeSession, onRefresh, timeDisplayFormat }: Props) {
  const today = dayjs().format('YYYY-MM-DD')

  return (
    <div className="space-y-6 xl:space-y-8">
      <div className="grid gap-6 xl:grid-cols-[2.2fr,1fr] xl:items-start">
        <div className="space-y-6">
          <SubtrackManager
            day={today}
            refreshKey={refreshKey}
            activeSession={activeSession}
            onChange={onRefresh}
            timeDisplayFormat={timeDisplayFormat}
          />
        </div>
        <aside className="xl:sticky xl:top-24">
          <TodayCalendarList day={today} refreshKey={refreshKey} />
        </aside>
      </div>
    </div>
  )
}
