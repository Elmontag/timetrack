import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import dayjs from 'dayjs'
import clsx from 'clsx'
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

const WORKFLOW_STEPS = [
  { value: 'request_draft', label: 'Dienstreiseantrag' },
  { value: 'requested', label: 'Dienstreise beantragt' },
  { value: 'settlement', label: 'Reise wird abgerechnet' },
  { value: 'settled', label: 'Reise abgerechnet' },
  { value: 'reimbursed', label: 'Kostenerstattung erhalten' },
] as const

type WorkflowState = (typeof WORKFLOW_STEPS)[number]['value']
const FINAL_WORKFLOW_STATE: WorkflowState = WORKFLOW_STEPS[WORKFLOW_STEPS.length - 1].value

const DOCUMENT_TYPES = [
  'Rechnung',
  'Antrag',
  'Beleg',
  'Reisekostenabrechnung',
  'Sonstige Unterlagen',
] as const

const SIGNABLE_TYPES = new Set(['Antrag', 'Reisekostenabrechnung'])

interface ModalConfig {
  mode: 'create' | 'edit'
  tripId?: number
}

type TravelFormState = {
  title: string
  start_date: string
  end_date: string
  destination: string
  purpose: string
  notes: string
}

type UploadDraft = {
  document_type: (typeof DOCUMENT_TYPES)[number]
  comment: string
  file: File | null
}

const defaultFormState = (): TravelFormState => ({
  title: '',
  start_date: dayjs().format('YYYY-MM-DD'),
  end_date: dayjs().format('YYYY-MM-DD'),
  destination: '',
  purpose: '',
  notes: '',
})

const defaultUploadDraft: UploadDraft = {
  document_type: DOCUMENT_TYPES[0],
  comment: '',
  file: null,
}

interface LightboxProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

function Lightbox({ open, title, onClose, children, footer }: LightboxProps) {
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
        <div className="mt-4 space-y-4 text-sm text-slate-200">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  )
}

export function TravelManager() {
  const [trips, setTrips] = useState<TravelTrip[]>([])
  const [loading, setLoading] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [formModal, setFormModal] = useState<ModalConfig | null>(null)
  const [formState, setFormState] = useState<TravelFormState>(() => defaultFormState())
  const [formError, setFormError] = useState<string | null>(null)
  const [formSaving, setFormSaving] = useState(false)
  const [uploadTrip, setUploadTrip] = useState<TravelTrip | null>(null)
  const [uploadDraft, setUploadDraft] = useState<UploadDraft>({ ...defaultUploadDraft })
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [expandedTrips, setExpandedTrips] = useState<number[]>([])
  const [workflowUpdating, setWorkflowUpdating] = useState<number | null>(null)
  const [updatingDocId, setUpdatingDocId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const loadTrips = useCallback(async () => {
    setLoading(true)
    setGlobalError(null)
    try {
      const data = await listTravels()
      setTrips(data)
      setExpandedTrips((prev) => prev.filter((id) => data.some((trip) => trip.id === id)))
      return data
    } catch (error) {
      console.error('Dienstreisen konnten nicht geladen werden', error)
      setGlobalError('Dienstreisen konnten nicht geladen werden.')
      setTrips([])
      setExpandedTrips([])
      return [] as TravelTrip[]
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTrips()
  }, [loadTrips])

  const activeTrips = useMemo(
    () => trips.filter((trip) => trip.workflow_state !== FINAL_WORKFLOW_STATE),
    [trips],
  )
  const archivedTrips = useMemo(
    () => trips.filter((trip) => trip.workflow_state === FINAL_WORKFLOW_STATE),
    [trips],
  )

  const openCreateModal = () => {
    setFormModal({ mode: 'create' })
    setFormState(defaultFormState())
    setFormError(null)
  }

  const openEditModal = (trip: TravelTrip) => {
    setFormModal({ mode: 'edit', tripId: trip.id })
    setFormState({
      title: trip.title,
      start_date: trip.start_date,
      end_date: trip.end_date,
      destination: trip.destination ?? '',
      purpose: trip.purpose ?? '',
      notes: trip.notes ?? '',
    })
    setFormError(null)
  }

  const closeFormModal = () => {
    setFormModal(null)
    setFormError(null)
  }

  const handleFormChange = (field: keyof TravelFormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }))
  }

  const handleFormSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!formModal) return

    const trimmedTitle = formState.title.trim()
    if (!trimmedTitle) {
      setFormError('Titel ist erforderlich.')
      return
    }
    if (dayjs(formState.end_date).isBefore(dayjs(formState.start_date))) {
      setFormError('Das Enddatum darf nicht vor dem Startdatum liegen.')
      return
    }

    const payload = {
      title: trimmedTitle,
      start_date: formState.start_date,
      end_date: formState.end_date,
      destination: formState.destination.trim() || null,
      purpose: formState.purpose.trim() || null,
      notes: formState.notes.trim() || null,
    }

    setFormSaving(true)
    setFormError(null)
    setGlobalError(null)

    try {
      if (formModal.mode === 'edit' && formModal.tripId) {
        await updateTravel(formModal.tripId, payload)
        await loadTrips()
      } else {
        const created = await createTravel({ ...payload, workflow_state: WORKFLOW_STEPS[0].value })
        await loadTrips()
        setExpandedTrips((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]))
      }
      closeFormModal()
    } catch (error) {
      console.error('Dienstreise konnte nicht gespeichert werden', error)
      setFormError('Dienstreise konnte nicht gespeichert werden.')
    } finally {
      setFormSaving(false)
    }
  }

  const toggleTrip = (tripId: number) => {
    setExpandedTrips((prev) =>
      prev.includes(tripId) ? prev.filter((id) => id !== tripId) : [...prev, tripId],
    )
  }

  const handleDelete = async (trip: TravelTrip) => {
    const confirmed = window.confirm(`Dienstreise "${trip.title}" wirklich löschen?`)
    if (!confirmed) return
    setGlobalError(null)
    try {
      await deleteTravel(trip.id)
      await loadTrips()
    } catch (error) {
      console.error('Dienstreise konnte nicht gelöscht werden', error)
      setGlobalError('Dienstreise konnte nicht gelöscht werden.')
    }
  }

  const handleWorkflowAdvance = async (trip: TravelTrip, direction: -1 | 1) => {
    const currentIndex = WORKFLOW_STEPS.findIndex((step) => step.value === trip.workflow_state)
    if (currentIndex === -1) return
    const nextIndex = currentIndex + direction
    if (nextIndex < 0 || nextIndex >= WORKFLOW_STEPS.length) return
    const nextState = WORKFLOW_STEPS[nextIndex].value

    setWorkflowUpdating(trip.id)
    setGlobalError(null)
    try {
      await updateTravel(trip.id, { workflow_state: nextState })
      await loadTrips()
      if (nextState === FINAL_WORKFLOW_STATE) {
        setExpandedTrips((prev) => prev.filter((id) => id !== trip.id))
      }
    } catch (error) {
      console.error('Workflow konnte nicht aktualisiert werden', error)
      setGlobalError('Workflow konnte nicht aktualisiert werden.')
    } finally {
      setWorkflowUpdating(null)
    }
  }

  const openUploadModal = (trip: TravelTrip) => {
    setUploadTrip(trip)
    setUploadDraft({ ...defaultUploadDraft })
    setUploadError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const closeUploadModal = () => {
    setUploadTrip(null)
    setUploadDraft({ ...defaultUploadDraft })
    setUploadError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleUploadSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!uploadTrip) return
    if (!uploadDraft.file) {
      setUploadError('Bitte wähle eine Datei zum Hochladen aus.')
      return
    }

    setUploading(true)
    setUploadError(null)
    setGlobalError(null)

    try {
      await uploadTravelDocument(uploadTrip.id, {
        document_type: uploadDraft.document_type,
        comment: uploadDraft.comment.trim() || undefined,
        file: uploadDraft.file,
      })
      await loadTrips()
      closeUploadModal()
    } catch (error) {
      console.error('Dokument konnte nicht hochgeladen werden', error)
      setUploadError('Dokument konnte nicht hochgeladen werden.')
    } finally {
      setUploading(false)
    }
  }

  const handleDocumentDelete = async (trip: TravelTrip, document: TravelDocument) => {
    const confirmed = window.confirm(`Dokument "${document.original_name}" löschen?`)
    if (!confirmed) return
    setGlobalError(null)
    setUpdatingDocId(document.id)
    try {
      await deleteTravelDocument(trip.id, document.id)
      await loadTrips()
    } catch (error) {
      console.error('Dokument konnte nicht gelöscht werden', error)
      setGlobalError('Dokument konnte nicht gelöscht werden.')
    } finally {
      setUpdatingDocId(null)
    }
  }

  const handleDocumentComment = async (trip: TravelTrip, document: TravelDocument) => {
    const next = window.prompt('Kommentar bearbeiten', document.comment ?? '')
    if (next === null) return
    setGlobalError(null)
    setUpdatingDocId(document.id)
    try {
      await updateTravelDocument(trip.id, document.id, { comment: next.trim() || null })
      await loadTrips()
    } catch (error) {
      console.error('Kommentar konnte nicht gespeichert werden', error)
      setGlobalError('Kommentar konnte nicht gespeichert werden.')
    } finally {
      setUpdatingDocId(null)
    }
  }

  const handleToggleSigned = async (trip: TravelTrip, document: TravelDocument) => {
    const next = !document.signed
    setGlobalError(null)
    setUpdatingDocId(document.id)
    try {
      await updateTravelDocument(trip.id, document.id, { signed: next })
      await loadTrips()
    } catch (error) {
      console.error('Signatur konnte nicht aktualisiert werden', error)
      setGlobalError('Signatur konnte nicht aktualisiert werden.')
    } finally {
      setUpdatingDocId(null)
    }
  }

  const renderTrip = (trip: TravelTrip) => {
    const isExpanded = expandedTrips.includes(trip.id)
    const statusIndex = Math.max(
      0,
      WORKFLOW_STEPS.findIndex((step) => step.value === trip.workflow_state),
    )
    const status = WORKFLOW_STEPS[statusIndex]
    const previousStep = statusIndex > 0 ? WORKFLOW_STEPS[statusIndex - 1] : null
    const nextStep =
      statusIndex < WORKFLOW_STEPS.length - 1 ? WORKFLOW_STEPS[statusIndex + 1] : null

    return (
      <li
        key={trip.id}
        className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg transition-shadow hover:shadow-xl"
      >
        <button
          type="button"
          onClick={() => toggleTrip(trip.id)}
          className="flex w-full items-start justify-between gap-4 text-left"
          aria-expanded={isExpanded}
        >
          <div>
            <h3 className="text-base font-semibold text-slate-100">{trip.title}</h3>
            <p className="mt-1 text-xs text-slate-400">
              {dayjs(trip.start_date).format('DD.MM.YYYY')} – {dayjs(trip.end_date).format('DD.MM.YYYY')}
              {trip.destination ? ` · ${trip.destination}` : ''}
            </p>
            {trip.purpose && <p className="mt-1 text-sm text-slate-300">{trip.purpose}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
              {status?.label ?? 'Unbekannter Status'}
            </span>
            <svg
              className={clsx('h-5 w-5 text-slate-400 transition-transform', isExpanded && 'rotate-180')}
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M5 8l5 5 5-5"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </button>
        {isExpanded && (
          <div className="mt-5 space-y-5 text-sm text-slate-200">
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                <span>Workflow</span>
                <span>
                  Schritt {statusIndex + 1} von {WORKFLOW_STEPS.length}
                </span>
              </div>
              <div className="mt-2 flex items-start gap-3">
                {WORKFLOW_STEPS.map((step, index) => (
                  <div key={step.value} className="flex-1">
                    <div
                      className={clsx(
                        'h-2 rounded-full transition-colors',
                        index <= statusIndex ? 'bg-primary' : 'bg-slate-700/60',
                      )}
                    />
                    <p
                      className={clsx(
                        'mt-2 text-[11px] font-medium leading-snug',
                        index === statusIndex ? 'text-primary' : 'text-slate-400',
                      )}
                    >
                      {step.label}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleWorkflowAdvance(trip, -1)}
                  disabled={!previousStep || workflowUpdating === trip.id}
                  className="inline-flex items-center rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  {previousStep ? `Zurück: ${previousStep.label}` : 'Kein vorheriger Schritt'}
                </button>
                <button
                  type="button"
                  onClick={() => handleWorkflowAdvance(trip, 1)}
                  disabled={!nextStep || workflowUpdating === trip.id}
                  className="inline-flex items-center rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                >
                  {nextStep ? `Weiter: ${nextStep.label}` : 'Workflow abgeschlossen'}
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <dl className="space-y-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Startdatum</dt>
                  <dd>{dayjs(trip.start_date).format('DD.MM.YYYY')}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Enddatum</dt>
                  <dd>{dayjs(trip.end_date).format('DD.MM.YYYY')}</dd>
                </div>
                {trip.destination && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Zielort</dt>
                    <dd>{trip.destination}</dd>
                  </div>
                )}
              </dl>
              <div className="space-y-2">
                {trip.notes && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-200">
                    {trip.notes}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(trip)}
                    className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
                  >
                    Reise bearbeiten
                  </button>
                  <button
                    type="button"
                    onClick={() => openUploadModal(trip)}
                    className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
                  >
                    Dokument hochladen
                  </button>
                  <a
                    href={travelDatasetDownloadUrl(trip.dataset_path)}
                    className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
                  >
                    Reisekostenabrechnungsdatensatz
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(trip)}
                    className="rounded-md border border-rose-500/40 px-3 py-1 text-xs text-rose-300 hover:border-rose-400 hover:text-rose-200"
                  >
                    Reise löschen
                  </button>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-200">Dokumente</h4>
              {trip.documents.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">Keine Dokumente vorhanden.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {trip.documents.map((document) => (
                    <li
                      key={document.id}
                      className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
                            <span>{document.document_type}</span>
                            <span>·</span>
                            <span>{dayjs(document.created_at).format('DD.MM.YYYY HH:mm')}</span>
                            {SIGNABLE_TYPES.has(document.document_type) && (
                              <span className="rounded bg-slate-900/50 px-2 py-0.5 text-[10px] text-slate-200">
                                {document.signed ? 'Unterschrieben' : 'Nicht unterschrieben'}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-slate-100">{document.original_name}</p>
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
                            disabled={updatingDocId === document.id}
                          >
                            Kommentar bearbeiten
                          </button>
                          {SIGNABLE_TYPES.has(document.document_type) && (
                            <button
                              type="button"
                              onClick={() => handleToggleSigned(trip, document)}
                              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
                              disabled={updatingDocId === document.id}
                            >
                              {document.signed ? 'Signatur entfernen' : 'Als unterschrieben markieren'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDocumentDelete(trip, document)}
                            className="rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-300 hover:border-rose-400 hover:text-rose-200"
                            disabled={updatingDocId === document.id}
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
        )}
      </li>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Dienstreisen</h2>
          <p className="text-sm text-slate-400">
            Verwalte laufende Reisen, behalte Dokumente im Blick und archiviere abgeschlossene Vorgänge.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
        >
          Neue Dienstreise
        </button>
      </div>

      {globalError && <p className="text-sm text-rose-300">{globalError}</p>}

      <section className="space-y-3">
        <header>
          <h3 className="text-sm font-semibold text-slate-200">Aktive Dienstreisen</h3>
          <p className="text-xs text-slate-500">
            Es werden nur Reisen angezeigt, die noch nicht als "Kostenerstattung erhalten" markiert sind.
          </p>
        </header>
        {loading ? (
          <p className="text-sm text-slate-400">Lade Dienstreisen…</p>
        ) : activeTrips.length === 0 ? (
          <p className="text-sm text-slate-400">Alle Dienstreisen sind abgeschlossen.</p>
        ) : (
          <ul className="space-y-4">{activeTrips.map((trip) => renderTrip(trip))}</ul>
        )}
      </section>

      {archivedTrips.length > 0 && (
        <section className="space-y-3 border-t border-slate-800 pt-4">
          <header>
            <h3 className="text-sm font-semibold text-slate-200">Archivierte Dienstreisen</h3>
            <p className="text-xs text-slate-500">
              Reisen im Status "Kostenerstattung erhalten" werden hier gesammelt.
            </p>
          </header>
          <ul className="space-y-4">{archivedTrips.map((trip) => renderTrip(trip))}</ul>
        </section>
      )}

      <Lightbox
        open={Boolean(formModal)}
        title={formModal?.mode === 'edit' ? 'Dienstreise bearbeiten' : 'Neue Dienstreise anlegen'}
        onClose={closeFormModal}
        footer={
          <>
            <button
              type="button"
              onClick={closeFormModal}
              className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              form="travel-form"
              disabled={formSaving}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              {formModal?.mode === 'edit' ? 'Änderungen speichern' : 'Dienstreise erstellen'}
            </button>
          </>
        }
      >
        <form id="travel-form" className="grid gap-4 md:grid-cols-2" onSubmit={handleFormSubmit}>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 md:col-span-2">
            Titel
            <input
              type="text"
              value={formState.title}
              onChange={(event) => handleFormChange('title', event.target.value)}
              required
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Startdatum
            <input
              type="date"
              value={formState.start_date}
              onChange={(event) => handleFormChange('start_date', event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Enddatum
            <input
              type="date"
              value={formState.end_date}
              onChange={(event) => handleFormChange('end_date', event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Zielort
            <input
              type="text"
              value={formState.destination}
              onChange={(event) => handleFormChange('destination', event.target.value)}
              placeholder="optional"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Zweck
            <input
              type="text"
              value={formState.purpose}
              onChange={(event) => handleFormChange('purpose', event.target.value)}
              placeholder="optional"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400 md:col-span-2">
            Notizen
            <textarea
              value={formState.notes}
              onChange={(event) => handleFormChange('notes', event.target.value)}
              rows={4}
              placeholder="optional"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          {formError && (
            <p className="md:col-span-2 text-sm text-rose-300">{formError}</p>
          )}
        </form>
      </Lightbox>

      <Lightbox
        open={Boolean(uploadTrip)}
        title={uploadTrip ? `Dokument für "${uploadTrip.title}" hochladen` : 'Dokument hochladen'}
        onClose={closeUploadModal}
        footer={
          <>
            <button
              type="button"
              onClick={closeUploadModal}
              className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              form="travel-upload"
              disabled={uploading}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              Dokument speichern
            </button>
          </>
        }
      >
        <form id="travel-upload" className="grid gap-4" onSubmit={handleUploadSubmit}>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Dokumenttyp
            <select
              value={uploadDraft.document_type}
              onChange={(event) =>
                setUploadDraft((prev) => ({ ...prev, document_type: event.target.value as UploadDraft['document_type'] }))
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
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Kommentar
            <input
              type="text"
              value={uploadDraft.comment}
              onChange={(event) =>
                setUploadDraft((prev) => ({ ...prev, comment: event.target.value }))
              }
              placeholder="optional"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Datei
            <input
              ref={fileInputRef}
              type="file"
              onChange={(event) =>
                setUploadDraft((prev) => ({ ...prev, file: event.target.files?.[0] ?? null }))
              }
              className="mt-1 w-full text-sm text-slate-100"
              required
            />
          </label>
          {uploadError && <p className="text-sm text-rose-300">{uploadError}</p>}
        </form>
      </Lightbox>
    </div>
  )
}
