import clsx from 'clsx'
import { ReactNode } from 'react'

interface LightboxProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  contentClassName?: string
}

export function Lightbox({ open, title, onClose, children, footer, contentClassName }: LightboxProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 py-8 backdrop-blur-sm dark:bg-slate-950/80">
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-100 bg-white/95 p-6 shadow-2xl backdrop-blur-lg dark:border-slate-800 dark:bg-slate-950/90"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 transition hover:border-primary hover:text-primary dark:border-slate-700 dark:text-slate-200"
          >
            Schließen
          </button>
        </div>
        <div className={clsx('mt-4 space-y-4 text-sm text-slate-700 dark:text-slate-200', contentClassName)}>{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3 text-slate-700 dark:text-slate-200">{footer}</div>}
      </div>
    </div>
  )
}
