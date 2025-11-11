import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import {
  createHoliday,
  deleteHoliday,
  HolidayEntry,
  importHolidaysFromIcs,
  listHolidays,
} from '../api'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onClose: () => void
  onUpdated?: () => void
}

export function HolidayManagerLightbox({ open, onClose, onUpdated }: Props) {
  const [holidays, setHolidays] = useState<HolidayEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ day: dayjs().format('YYYY-MM-DD'), name: '' })
  const [icsContent, setIcsContent] = useState('')
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadHolidays = useCallback(async () => {
    if (!open) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await listHolidays()
      setHolidays(data)
    } catch (err) {
      console.error(err)
      setError('Feiertage konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [open])

  useEffect(() => {
    loadHolidays()
  }, [loadHolidays])

  const handleAddHoliday = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.day || !form.name.trim()) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createHoliday({ day: form.day, name: form.name.trim() })
      await loadHolidays()
      setForm({ day: dayjs(form.day).add(1, 'day').format('YYYY-MM-DD'), name: '' })
      onUpdated?.()
    } catch (err) {
      console.error(err)
      setError('Feiertag konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (holidayId: number) => {
    setError(null)
    try {
      await deleteHoliday(holidayId)
      await loadHolidays()
      onUpdated?.()
    } catch (err) {
      console.error(err)
      setError('Feiertag konnte nicht entfernt werden.')
    }
  }

  const handleImport = async () => {
    if (!icsContent.trim()) {
      return
    }
    setImporting(true)
    setError(null)
    try {
      await importHolidaysFromIcs(icsContent)
      setIcsContent('')
      await loadHolidays()
      onUpdated?.()
    } catch (err) {
      console.error(err)
      setError('ICS-Import fehlgeschlagen. Bitte Datei prüfen.')
    } finally {
      setImporting(false)
    }
  }

  const upcomingHolidays = useMemo(
    () =>
      [...holidays].sort((a, b) => a.day.localeCompare(b.day)),
    [holidays],
  )

  return (
    <Modal open={open} onClose={onClose} title="Feiertage verwalten">
      <p className="text-sm text-slate-300">
        Trage gesetzliche Feiertage manuell ein oder füge sie gesammelt per ICS-Datei hinzu. Wochenenden und Feiertage werden
        automatisch von Arbeits- und Urlaubskonten ausgenommen.
      </p>
      {error && <p className="mt-3 rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{error}</p>}
      <form onSubmit={handleAddHoliday} className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-sm text-slate-300">
          Datum
          <input
            type="date"
            value={form.day}
            onChange={(event) => setForm((prev) => ({ ...prev, day: event.target.value }))}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            required
          />
        </label>
        <label className="md:col-span-2 text-sm text-slate-300">
          Bezeichnung
          <input
            type="text"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="z. B. Tag der Deutschen Einheit"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            required
          />
        </label>
        <div className="md:col-span-3 flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50"
          >
            Feiertag speichern
          </button>
        </div>
      </form>
      <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <h3 className="text-sm font-semibold text-slate-200">ICS-Import</h3>
        <p className="mt-1 text-xs text-slate-400">
          Füge hier den Inhalt einer ICS-Datei ein (z. B. aus einem Feiertagskalender). Bereits vorhandene Einträge werden aktualisiert.
        </p>
        <textarea
          value={icsContent}
          onChange={(event) => setIcsContent(event.target.value)}
          rows={6}
          placeholder="BEGIN:VCALENDAR\nBEGIN:VEVENT…"
          className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleImport}
            disabled={importing || !icsContent.trim()}
            className="inline-flex items-center rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-primary hover:text-primary disabled:opacity-50"
          >
            ICS importieren
          </button>
        </div>
      </div>
      <div className="mt-6 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 py-2 text-xs uppercase tracking-wide text-slate-400">
          <span>Datum</span>
          <span>Name</span>
          <span>Quelle</span>
          <span>Aktion</span>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y divide-slate-800">
          {loading && <p className="px-4 py-3 text-sm text-slate-400">Lade Feiertage…</p>}
          {!loading && upcomingHolidays.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-400">Noch keine Feiertage hinterlegt.</p>
          )}
          {!loading &&
            upcomingHolidays.map((holiday) => (
              <div key={holiday.id} className="grid grid-cols-4 items-center px-4 py-2 text-sm text-slate-200">
                <span>{holiday.day}</span>
                <span className="truncate" title={holiday.name}>
                  {holiday.name}
                </span>
                <span className="uppercase text-slate-400">{holiday.source}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(holiday.id)}
                  className="justify-self-end rounded-md border border-red-400/40 px-3 py-1 text-xs font-medium text-red-300 transition hover:border-red-400 hover:text-red-200"
                >
                  Entfernen
                </button>
              </div>
            ))}
        </div>
      </div>
    </Modal>
  )
}
