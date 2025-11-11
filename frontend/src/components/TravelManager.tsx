import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import {
  createTravel,
  deleteTravel,
  deleteTravelDocument,
  listTravels,
  TravelDocument,
  TravelTrip,
  travelDatasetDownloadUrl,
  travelDocumentDownloadUrl,
  updateTravel,
  updateTravelDocument,
  uploadTravelDocument,
} from '../api'

const WORKFLOW_OPTIONS: { value: string; label: string }[] = [
  { value: 'request_draft', label: 'Dienstreiseantrag' },
  { value: 'requested', label: 'Dienstreise beantragt' },
  { value: 'settlement', label: 'Reise wird abgerechnet' },
  { value: 'settled', label: 'Reise abgerechnet' },
]

const DOCUMENT_TYPES = [
  'Rechnung',
  'Antrag',
  'Beleg',
  'Reisekostenabrechnung',
  'Sonstige Unterlagen',
] as const

const SIGNABLE_TYPES = new Set(['Antrag', 'Reisekostenabrechnung'])

type UploadDraft = {
  document_type: string
  comment: string
  file: File | null
}

type UploadState = Record<number, UploadDraft>

const defaultUploadDraft: UploadDraft = {
  document_type: DOCUMENT_TYPES[0],
  comment: '',
  file: null,
}

export function TravelManager() {
  const [trips, setTrips] = useState<TravelTrip[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [uploadDrafts, setUploadDrafts] = useState<UploadState>({})
  const [uploadingTrip, setUploadingTrip] = useState<number | null>(null)
  const [updatingDoc, setUpdatingDoc] = useState<number | null>(null)
  const [form, setForm] = useState({
    title: '',
    start_date: dayjs().format('YYYY-MM-DD'),
    end_date: dayjs().format('YYYY-MM-DD'),
    destination: '',
    purpose: '',
    workflow_state: WORKFLOW_OPTIONS[0]?.value ?? 'request_draft',
    notes: '',
  })

  const loadTrips = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listTravels()
      setTrips(data)
      const draftState: UploadState = {}
      data.forEach((trip) => {
        draftState[trip.id] = {
          document_type: DOCUMENT_TYPES[0],
          comment: '',
          file: null,
        }
      })
      setUploadDrafts(draftState)
    } catch (err) {
      console.error('Dienstreisen konnten nicht geladen werden', err)
      setError('Dienstreisen konnten nicht geladen werden.')
      setTrips([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTrips()
  }, [loadTrips])

  const resetForm = () => {
    setForm({
      title: '',
      start_date: dayjs().format('YYYY-MM-DD'),
      end_date: dayjs().format('YYYY-MM-DD'),
      destination: '',
      purpose: '',
      workflow_state: WORKFLOW_OPTIONS[0]?.value ?? 'request_draft',
      notes: '',
    })
    setEditingId(null)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.title.trim()) {
      setError('Titel ist erforderlich.')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      title: form.title.trim(),
      start_date: form.start_date,
      end_date: form.end_date,
      destination: form.destination.trim() || null,
      purpose: form.purpose.trim() || null,
      workflow_state: form.workflow_state,
      notes: form.notes.trim() || null,
    }
    try {
      if (editingId) {
        await updateTravel(editingId, payload)
      } else {
        await createTravel(payload)
      }
      resetForm()
      await loadTrips()
    } catch (err) {
      console.error('Dienstreise konnte nicht gespeichert werden', err)
      setError('Dienstreise konnte nicht gespeichert werden.')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (trip: TravelTrip) => {
    setEditingId(trip.id)
    setForm({
      title: trip.title,
      start_date: trip.start_date,
      end_date: trip.end_date,
      destination: trip.destination ?? '',
      purpose: trip.purpose ?? '',
      workflow_state: trip.workflow_state,
      notes: trip.notes ?? '',
    })
  }

  const handleDelete = async (trip: TravelTrip) => {
    const confirmed = window.confirm(`Dienstreise "${trip.title}" wirklich löschen?`)
    if (!confirmed) return
    setError(null)
    try {
      await deleteTravel(trip.id)
      await loadTrips()
    } catch (err) {
      console.error('Dienstreise konnte nicht gelöscht werden', err)
      setError('Dienstreise konnte nicht gelöscht werden.')
    }
  }

  const handleWorkflowUpdate = async (trip: TravelTrip, nextState: string) => {
    setError(null)
    try {
      await updateTravel(trip.id, { workflow_state: nextState })
      await loadTrips()
    } catch (err) {
      console.error('Workflow konnte nicht aktualisiert werden', err)
      setError('Workflow konnte nicht aktualisiert werden.')
    }
  }

  const updateUploadDraft = (tripId: number, draft: Partial<UploadDraft>) => {
    setUploadDrafts((prev) => {
      const current = prev[tripId] ?? defaultUploadDraft
      return {
        ...prev,
        [tripId]: { ...current, ...draft },
      }
    })
  }

  const handleFileChange = (tripId: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    updateUploadDraft(tripId, { file })
  }

  const handleUpload = async (event: FormEvent<HTMLFormElement>, trip: TravelTrip) => {
    event.preventDefault()
    const draft = uploadDrafts[trip.id] ?? defaultUploadDraft
    if (!draft.file) {
      setError('Bitte wähle eine Datei zum Hochladen aus.')
      return
    }
    setUploadingTrip(trip.id)
    setError(null)
    try {
      await uploadTravelDocument(trip.id, {
        document_type: draft.document_type,
        comment: draft.comment.trim() || undefined,
        file: draft.file,
      })
      updateUploadDraft(trip.id, { ...defaultUploadDraft })
      event.currentTarget.reset()
      await loadTrips()
    } catch (err) {
      console.error('Dokument konnte nicht hochgeladen werden', err)
      setError('Dokument konnte nicht hochgeladen werden.')
    } finally {
      setUploadingTrip(null)
    }
  }

  const handleDocumentDelete = async (trip: TravelTrip, document: TravelDocument) => {
    const confirmed = window.confirm(`Dokument "${document.original_name}" löschen?`)
    if (!confirmed) return
    setError(null)
    setUpdatingDoc(document.id)
    try {
      await deleteTravelDocument(trip.id, document.id)
      await loadTrips()
    } catch (err) {
      console.error('Dokument konnte nicht gelöscht werden', err)
      setError('Dokument konnte nicht gelöscht werden.')
    } finally {
      setUpdatingDoc(null)
    }
  }

  const handleDocumentComment = async (trip: TravelTrip, document: TravelDocument) => {
    const next = window.prompt('Kommentar bearbeiten', document.comment ?? '')
    if (next === null) return
    setError(null)
    setUpdatingDoc(document.id)
    try {
      await updateTravelDocument(trip.id, document.id, { comment: next.trim() || null })
      await loadTrips()
    } catch (err) {
      console.error('Kommentar konnte nicht gespeichert werden', err)
      setError('Kommentar konnte nicht gespeichert werden.')
    } finally {
      setUpdatingDoc(null)
    }
  }

  const handleToggleSigned = async (trip: TravelTrip, document: TravelDocument) => {
    const next = !document.signed
    setError(null)
    setUpdatingDoc(document.id)
    try {
      await updateTravelDocument(trip.id, document.id, { signed: next })
      await loadTrips()
    } catch (err) {
      console.error('Signatur konnte nicht aktualisiert werden', err)
      setError('Signatur konnte nicht aktualisiert werden.')
    } finally {
      setUpdatingDoc(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Dienstreisen verwalten</h2>
            <p className="text-sm text-slate-400">
              Lege neue Dienstreisen an, pflege den Workflow und verwalte Dokumente.
            </p>
          </div>
          <button
            type="button"
            onClick={resetForm}
            className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
          >
            Formular zurücksetzen
          </button>
        </div>
        <form className="mt-4 grid gap-4 md:grid-cols-6" onSubmit={handleSubmit}>
          <label className="text-sm text-slate-300 md:col-span-3">
            Titel
            <input
              type="text"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              required
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-sm text-slate-300 md:col-span-3">
            Workflow-Status
            <select
              value={form.workflow_state}
              onChange={(event) => setForm((prev) => ({ ...prev, workflow_state: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {WORKFLOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-300">
            Startdatum
            <input
              type="date"
              value={form.start_date}
              onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-sm text-slate-300">
            Enddatum
            <input
              type="date"
              value={form.end_date}
              onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-sm text-slate-300 md:col-span-2">
            Zielort
            <input
              type="text"
              value={form.destination}
              onChange={(event) => setForm((prev) => ({ ...prev, destination: event.target.value }))}
              placeholder="optional"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-sm text-slate-300 md:col-span-3">
            Zweck
            <input
              type="text"
              value={form.purpose}
              onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))}
              placeholder="optional"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-sm text-slate-300 md:col-span-3">
            Notizen
            <textarea
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={3}
              placeholder="optional"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <div className="md:col-span-6 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-sky-400/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50"
            >
              {editingId ? 'Änderungen speichern' : 'Dienstreise anlegen'}
            </button>
          </div>
        </form>
        {error && (
          <p className="mt-3 text-sm text-rose-300">{error}</p>
        )}
      </div>
      <div className="space-y-4">
        {loading && <p className="text-sm text-slate-400">Lade Dienstreisen…</p>}
        {!loading && trips.length === 0 && (
          <p className="text-sm text-slate-400">Noch keine Dienstreisen angelegt.</p>
        )}
        {!loading &&
          trips.map((trip) => {
            const uploadDraft = uploadDrafts[trip.id] ?? defaultUploadDraft
            return (
              <div key={trip.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100">{trip.title}</h3>
                    <p className="text-sm text-slate-400">
                      {dayjs(trip.start_date).format('DD.MM.YYYY')} – {dayjs(trip.end_date).format('DD.MM.YYYY')}
                      {trip.destination ? ` · ${trip.destination}` : ''}
                    </p>
                    {trip.purpose && <p className="text-sm text-slate-300">{trip.purpose}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={trip.workflow_state}
                      onChange={(event) => handleWorkflowUpdate(trip, event.target.value)}
                      className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs text-slate-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {WORKFLOW_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <a
                      href={travelDatasetDownloadUrl(trip.dataset_path)}
                      className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
                    >
                      Reisekostenabrechnungsdatensatz
                    </a>
                    <button
                      type="button"
                      onClick={() => handleEdit(trip)}
                      className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
                    >
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(trip)}
                      className="rounded-md border border-rose-500/50 px-3 py-1 text-xs text-rose-300 hover:border-rose-400 hover:text-rose-200"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
                {trip.notes && (
                  <p className="mt-3 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
                    {trip.notes}
                  </p>
                )}
                <form
                  className="mt-4 grid gap-3 md:grid-cols-6"
                  onSubmit={(event) => handleUpload(event, trip)}
                >
                  <label className="text-xs text-slate-300 md:col-span-2">
                    Dokumenttyp
                    <select
                      value={uploadDraft.document_type}
                      onChange={(event) =>
                        updateUploadDraft(trip.id, { document_type: event.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {DOCUMENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-300 md:col-span-2">
                    Kommentar
                    <input
                      type="text"
                      value={uploadDraft.comment}
                      onChange={(event) =>
                        updateUploadDraft(trip.id, { comment: event.target.value })
                      }
                      placeholder="optional"
                      className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </label>
                  <label className="text-xs text-slate-300 md:col-span-2">
                    Datei
                    <input
                      type="file"
                      onChange={(event) => handleFileChange(trip.id, event)}
                      className="mt-1 w-full text-sm text-slate-100"
                      required
                    />
                  </label>
                  <div className="md:col-span-6 flex justify-end">
                    <button
                      type="submit"
                      disabled={uploadingTrip === trip.id}
                      className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary disabled:opacity-50"
                    >
                      Dokument hochladen
                    </button>
                  </div>
                </form>
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-slate-200">Dokumente</h4>
                  {trip.documents.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">Keine Dokumente vorhanden.</p>
                  ) : (
                    <ul className="mt-3 space-y-3">
                      {trip.documents.map((document) => (
                        <li
                          key={document.id}
                          className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                                <span>{document.document_type}</span>
                                <span>·</span>
                                <span>{dayjs(document.created_at).format('DD.MM.YYYY HH:mm')}</span>
                                {SIGNABLE_TYPES.has(document.document_type) && (
                                  <span className="rounded bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-300">
                                    {document.signed ? 'Unterschrieben' : 'Nicht unterschrieben'}
                                  </span>
                                )}
                              </div>
                              <p className="font-medium text-slate-100">{document.original_name}</p>
                              <p className="text-xs text-slate-400">
                                {document.comment ? document.comment : 'Kein Kommentar hinterlegt.'}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <a
                                href={travelDocumentDownloadUrl(trip.id, document.id)}
                                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
                              >
                                Download
                              </a>
                              <button
                                type="button"
                                onClick={() => handleDocumentComment(trip, document)}
                                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
                                disabled={updatingDoc === document.id}
                              >
                                Kommentar bearbeiten
                              </button>
                              {SIGNABLE_TYPES.has(document.document_type) && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleSigned(trip, document)}
                                  className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
                                  disabled={updatingDoc === document.id}
                                >
                                  {document.signed ? 'Signatur entfernen' : 'Als unterschrieben markieren'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDocumentDelete(trip, document)}
                                className="rounded-md border border-rose-500/50 px-2 py-1 text-xs text-rose-300 hover:border-rose-400 hover:text-rose-200"
                                disabled={updatingDoc === document.id}
                              >
                                Löschen
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
