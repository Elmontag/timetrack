import dayjs from 'dayjs'
import { WorkSession } from '../api'
import { useSessionRuntime } from '../hooks/useSessionRuntime'

interface Props {
  session: WorkSession | null
}

export function SessionTimerDisplay({ session }: Props) {
  const { runtime, status } = useSessionRuntime(session)
  const notes = session?.notes ?? []
  const latestNote = notes.length > 0 ? notes[notes.length - 1] : null

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-center shadow-inner shadow-slate-950/50">
      <p className="text-xs uppercase tracking-wide text-slate-500">Laufende Arbeitszeit</p>
      <p className="mt-3 font-mono text-4xl font-semibold text-primary">{runtime}</p>
      <p className="mt-2 text-sm text-slate-300">Status: {status}</p>
      {latestNote && (
        <p className="mt-2 text-xs text-slate-400">
          {latestNote.note_type === 'start' ? 'Startnotiz' : 'Notiz'}{' '}
          {dayjs(latestNote.created_at).format('DD.MM.YYYY HH:mm')} – „{latestNote.content}“
        </p>
      )}
    </div>
  )
}
