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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8">
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950/90 p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
          >
            Schließen
          </button>
        </div>
        <div className={clsx('mt-4 space-y-4 text-sm text-slate-200', contentClassName)}>{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  )
}
