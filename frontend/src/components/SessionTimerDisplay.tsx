import { WorkSession } from '../api'
import { useSessionRuntime } from '../hooks/useSessionRuntime'

interface Props {
  session: WorkSession | null
}

export function SessionTimerDisplay({ session }: Props) {
  const { runtime, status } = useSessionRuntime(session)

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-center shadow-inner shadow-slate-950/50">
      <p className="text-xs uppercase tracking-wide text-slate-500">Laufende Arbeitszeit</p>
      <p className="mt-3 font-mono text-4xl font-semibold text-primary">{runtime}</p>
      <p className="mt-2 text-sm text-slate-300">Status: {status}</p>
      {session && session.comment && <p className="mt-2 text-sm text-slate-300">{session.comment}</p>}
    </div>
  )
}
