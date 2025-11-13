import { FormEvent, useEffect, useState } from 'react'
import { Modal } from './Modal'

export interface TaskFormValues {
  title: string
  start: string
  end: string
  project: string
  tags: string
  note: string
}

interface TaskEditorModalProps {
  open: boolean
  day: string
  title: string
  initialValues: TaskFormValues
  submitting: boolean
  error: string | null
  onClose: () => void
  onSubmit: (values: TaskFormValues) => void
}

const EMPTY_FORM: TaskFormValues = {
  title: '',
  start: '',
  end: '',
  project: '',
  tags: '',
  note: '',
}

export function TaskEditorModal({
  open,
  day,
  title,
  initialValues,
  submitting,
  error,
  onClose,
  onSubmit,
}: TaskEditorModalProps) {
  const [values, setValues] = useState<TaskFormValues>(initialValues ?? EMPTY_FORM)

  useEffect(() => {
    if (open) {
      setValues(initialValues ?? EMPTY_FORM)
    }
  }, [open, initialValues])

  const handleChange = (field: keyof TaskFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(values)
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs uppercase tracking-wide text-slate-500">
          Tag: {day}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-300">
            Titel
            <input
              type="text"
              value={values.title}
              onChange={(event) => handleChange('title', event.target.value)}
              required
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-300">
              Start
              <input
                type="time"
                value={values.start}
                onChange={(event) => handleChange('start', event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="text-sm text-slate-300">
              Ende
              <input
                type="time"
                value={values.end}
                onChange={(event) => handleChange('end', event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-300">
            Projekt
            <input
              type="text"
              value={values.project}
              onChange={(event) => handleChange('project', event.target.value)}
              placeholder="optional"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-sm text-slate-300">
            Tags (kommagetrennt)
            <input
              type="text"
              value={values.tags}
              onChange={(event) => handleChange('tags', event.target.value)}
              placeholder="z. B. Meeting, Kunden"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
        </div>
        <label className="text-sm text-slate-300">
          Notiz
          <textarea
            value={values.note}
            onChange={(event) => handleChange('note', event.target.value)}
            rows={3}
            placeholder="optional"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400/90 disabled:opacity-60"
          >
            Speichern
          </button>
        </div>
      </form>
    </Modal>
  )
}
