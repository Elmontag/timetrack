import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { API_BASE } from '../config'
import { createActionToken } from '../api'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onClose: () => void
}

interface ActionConfig {
  scope: string
  label: string
  description: string
}

interface TokenState {
  loading: boolean
  url: string | null
  createdAt: string | null
}

const ACTIONS: ActionConfig[] = [
  { scope: 'start', label: 'Start', description: 'Startet sofort eine neue Arbeitszeiterfassung.' },
  { scope: 'pause', label: 'Pause', description: 'Pausiert oder setzt die aktuelle Erfassung fort.' },
  { scope: 'stop', label: 'Stop', description: 'Beendet die aktuelle Arbeitszeiterfassung.' },
  { scope: 'toggle', label: 'Toggle', description: 'Startet, pausiert oder setzt je nach aktuellem Status fort.' },
]

function buildActionUrl(token: string) {
  const base = API_BASE.replace(/\/$/, '')
  return `${base}/a/${token}`
}

export function PermalinkLightbox({ open, onClose }: Props) {
  const initialState = useMemo(() => {
    const entries: Record<string, TokenState> = {}
    ACTIONS.forEach((action) => {
      entries[action.scope] = { loading: false, url: null, createdAt: null }
    })
    return entries
  }, [])
  const [tokens, setTokens] = useState<Record<string, TokenState>>(initialState)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async (scope: string) => {
    setTokens((prev) => ({
      ...prev,
      [scope]: { ...prev[scope], loading: true },
    }))
    setError(null)
    try {
      const token = await createActionToken({ scope, ttl_minutes: 1440 })
      setTokens((prev) => ({
        ...prev,
        [scope]: {
          loading: false,
          url: buildActionUrl(token.token),
          createdAt: token.created_at,
        },
      }))
    } catch (err) {
      console.error(err)
      setTokens((prev) => ({
        ...prev,
        [scope]: { ...prev[scope], loading: false },
      }))
      setError('Permalink konnte nicht erstellt werden.')
    }
  }

  const handleCopy = async (scope: string) => {
    const url = tokens[scope]?.url
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setTokens((prev) => ({
        ...prev,
        [scope]: { ...prev[scope], createdAt: dayjs().toISOString() },
      }))
    } catch (err) {
      console.error(err)
      setError('URL konnte nicht in die Zwischenablage kopiert werden.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Permalinks & NFC-Aktionen">
      <p className="text-sm text-slate-300">
        Erzeuge hier einmalige Links für Start/Pause/Stop. Hinterlege sie als Browser-Lesezeichen, teile sie mit NFC-Tags oder
        verwende sie in Shortcuts. Links sind 24 Stunden gültig und können anschließend neu generiert werden.
      </p>
      {error && <p className="mt-3 rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{error}</p>}
      <div className="mt-4 space-y-4">
        {ACTIONS.map((action) => {
          const state = tokens[action.scope]
          return (
            <div key={action.scope} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">{action.label}</h3>
                  <p className="text-xs text-slate-400">{action.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleGenerate(action.scope)}
                    disabled={state?.loading}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-slate-950 shadow hover:bg-sky-400/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50"
                  >
                    {state?.url ? 'Neu generieren' : 'Link erstellen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(action.scope)}
                    disabled={!state?.url}
                    className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    Kopieren
                  </button>
                </div>
              </div>
              {state?.url && (
                <div className="mt-3 break-all rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-200">
                  <div className="font-mono">{state.url}</div>
                  {state.createdAt && (
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
                      Zuletzt aktualisiert: {dayjs(state.createdAt).format('DD.MM.YYYY HH:mm')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
