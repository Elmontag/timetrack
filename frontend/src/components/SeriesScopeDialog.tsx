interface SeriesScopeDialogProps {
  open: boolean
  eventTitle: string
  onSelect(scope: 'single' | 'series'): void
  onCancel(): void
}

export function SeriesScopeDialog({ open, eventTitle, onSelect, onCancel }: SeriesScopeDialogProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Serientermin als hinfällig markieren"
        className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
      >
        <h3 className="text-lg font-semibold text-slate-100">Serientermin hinfällig?</h3>
        <p className="mt-3 text-sm text-slate-300">
          Soll der Termin „{eventTitle}“ nur für diese Instanz oder für die gesamte Serie als hinfällig markiert werden?
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <button
            type="button"
            onClick={() => onSelect('single')}
            className="flex-1 rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-primary hover:text-primary"
          >
            Nur diesen Termin
          </button>
          <button
            type="button"
            onClick={() => onSelect('series')}
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90"
          >
            Gesamte Serie
          </button>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full rounded-md border border-transparent px-4 py-2 text-center text-sm font-medium text-slate-400 hover:text-slate-200"
        >
          Abbrechen
        </button>
      </div>
    </div>
  )
}
