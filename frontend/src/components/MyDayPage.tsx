import dayjs from 'dayjs'
import { SubtrackManager } from './SubtrackManager'
import { TodayCalendarList } from './TodayCalendarList'

interface Props {
  refreshKey: string
}

export function MyDayPage({ refreshKey }: Props) {
  const today = dayjs().format('YYYY-MM-DD')

  return (
    <div className="space-y-6 xl:space-y-8">
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
