import {
  ChangeEvent,
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import dayjs from 'dayjs'
import clsx from 'clsx'
import {
  createTravel,
  deleteTravel,
  deleteTravelDocument,
  createTravelLetter,
  getTravelLetterPreview,
  listTravels,
  TravelDocument,
  TravelTrip,
  TravelLetterPreview,
  travelDatasetDownloadUrl,
  travelDatasetPrintUrl,
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
  'Anschreiben',
] as const

const SIGNABLE_TYPES = new Set(['Antrag', 'Reisekostenabrechnung'])

const CONTACT_ORDER = [
  'name',
  'company',
  'department',
  'street',
  'postal_code',
  'city',
  'phone',
  'email',
] as const

const CONTACT_LABELS: Record<(typeof CONTACT_ORDER)[number], string> = {
  name: 'Name',
  company: 'Firma',
  department: 'Abteilung',
  street: 'Straße',
  postal_code: 'PLZ',
  city: 'Ort',
  phone: 'Telefon',
  email: 'E-Mail',
}

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
  id: string
  document_type: (typeof DOCUMENT_TYPES)[number]
  comment: string
  file: File
}

const defaultFormState = (): TravelFormState => ({
  title: '',
  start_date: dayjs().format('YYYY-MM-DD'),
  end_date: dayjs().format('YYYY-MM-DD'),
  destination: '',
  purpose: '',
  notes: '',
})

interface LightboxProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  contentClassName?: string
}

function Lightbox({ open, title, onClose, children, footer, contentClassName }: LightboxProps) {
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

export function TravelManager() {
  const [trips, setTrips] = useState<TravelTrip[]>([])
  const [loading, setLoading] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [formModal, setFormModal] = useState<ModalConfig | null>(null)
  const [formState, setFormState] = useState<TravelFormState>(() => defaultFormState())
  const [formError, setFormError] = useState<string | null>(null)
  const [formSaving, setFormSaving] = useState(false)
  const [uploadTrip, setUploadTrip] = useState<TravelTrip | null>(null)
  const [uploadDrafts, setUploadDrafts] = useState<UploadDraft[]>([])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [expandedTrips, setExpandedTrips] = useState<number[]>([])
  const [expandedCollections, setExpandedCollections] = useState<number[]>([])
  const [workflowUpdating, setWorkflowUpdating] = useState<number | null>(null)
  const [updatingDocId, setUpdatingDocId] = useState<number | null>(null)
  const [openDatasetMenuId, setOpenDatasetMenuId] = useState<number | null>(null)
  const [archivedModalOpen, setArchivedModalOpen] = useState(false)
  const [archivedSearch, setArchivedSearch] = useState({
    title: '',
    destination: '',
    date: '',
  })
  const [archivedPage, setArchivedPage] = useState(1)
  const [archivedPageSize, setArchivedPageSize] = useState(10)
  const [letterTrip, setLetterTrip] = useState<TravelTrip | null>(null)
  const [letterPreview, setLetterPreview] = useState<TravelLetterPreview | null>(null)
  const [letterLoading, setLetterLoading] = useState(false)
  const [letterSaving, setLetterSaving] = useState(false)
  const [letterError, setLetterError] = useState<string | null>(null)
  const [letterSubject, setLetterSubject] = useState('')
  const [letterBody, setLetterBody] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const draftIdCounter = useRef(0)

  const createDraftFromFile = useCallback(
    (file: File): UploadDraft => {
      draftIdCounter.current += 1
      return {
        id: `draft-${Date.now()}-${draftIdCounter.current}`,
        document_type: DOCUMENT_TYPES[0],
        comment: '',
        file,
      }
    },
    [],
  )

  const addFilesToDrafts = useCallback(
    (files: FileList | File[]) => {
      const incomingFiles = Array.from(files).filter((file) => file.size > 0)
      if (incomingFiles.length === 0) return
      setUploadError(null)
      setUploadDrafts((prev) => [...prev, ...incomingFiles.map((file) => createDraftFromFile(file))])
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [createDraftFromFile],
  )

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      if (uploading) return
      if (event.target.files && event.target.files.length > 0) {
        addFilesToDrafts(event.target.files)
      }
    },
    [addFilesToDrafts, uploading],
  )

  const handleDropFiles = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      if (uploading) return
      if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
        addFilesToDrafts(event.dataTransfer.files)
      }
    },
    [addFilesToDrafts, uploading],
  )

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      if (uploading) {
        event.dataTransfer.dropEffect = 'none'
        return
      }
      event.dataTransfer.dropEffect = 'copy'
    },
    [uploading],
  )

  const removeDraft = useCallback((id: string) => {
    setUploadDrafts((prev) => prev.filter((draft) => draft.id !== id))
  }, [])

  const updateDraft = useCallback(
    (id: string, changes: Partial<Pick<UploadDraft, 'document_type' | 'comment'>>) => {
      setUploadDrafts((prev) =>
        prev.map((draft) => (draft.id === id ? { ...draft, ...changes } : draft)),
      )
    },
    [],
  )

  const openLetterModal = useCallback(
    (trip: TravelTrip) => {
      setOpenDatasetMenuId(null)
      setLetterTrip(trip)
      setLetterPreview(null)
      setLetterSubject(`Reisekostenabrechnung ${trip.title}`.trim())
      setLetterBody('')
      setLetterError(null)
      setLetterLoading(true)
      getTravelLetterPreview(trip.id)
        .then((previewData) => {
          setLetterPreview(previewData)
          setLetterSubject(previewData.subject)
          setLetterBody(previewData.body)
        })
        .catch((error) => {
          console.error(error)
          setLetterError('Anschreiben konnte nicht vorbereitet werden.')
        })
        .finally(() => {
          setLetterLoading(false)
        })
    },
    [],
  )

  const closeLetterModal = useCallback(() => {
    setLetterTrip(null)
    setLetterPreview(null)
    setLetterSubject('')
    setLetterBody('')
    setLetterError(null)
    setLetterLoading(false)
    setLetterSaving(false)
  }, [])

  const handleLetterSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!letterTrip) {
        return
      }
      setLetterSaving(true)
      setLetterError(null)
      try {
        const document = await createTravelLetter(letterTrip.id, {
          subject: letterSubject.trim(),
          body: letterBody,
        })
        setTrips((prev) =>
          prev.map((trip) =>
            trip.id === letterTrip.id
              ? { ...trip, documents: [...trip.documents, document] }
              : trip,
          ),
        )
        const downloadUrl = travelDocumentDownloadUrl(document.trip_id, document.id)
        closeLetterModal()
        window.open(downloadUrl, '_blank')
      } catch (error) {
        console.error(error)
        setLetterError('Anschreiben konnte nicht erstellt werden.')
      } finally {
        setLetterSaving(false)
      }
    },
    [closeLetterModal, letterBody, letterSubject, letterTrip, setTrips],
  )

  const loadTrips = useCallback(async () => {
    setLoading(true)
    setGlobalError(null)
    try {
      const data = await listTravels()
      setTrips(data)
      setExpandedTrips((prev) => prev.filter((id) => data.some((trip) => trip.id === id)))
      const invoiceIds = data.flatMap((trip) =>
        trip.documents
          .filter((document) => document.document_type === 'Rechnung')
          .map((document) => document.id),
      )
      setExpandedCollections((prev) => {
        const preserved = prev.filter((id) => invoiceIds.includes(id))
        const missing = invoiceIds.filter((id) => !preserved.includes(id))
        return [...preserved, ...missing]
      })
      setOpenDatasetMenuId(null)
      return data
    } catch (error) {
      console.error('Dienstreisen konnten nicht geladen werden', error)
      setGlobalError('Dienstreisen konnten nicht geladen werden.')
      setTrips([])
      setExpandedTrips([])
      setExpandedCollections([])
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
  const filteredArchivedTrips = useMemo(() => {
    const titleQuery = archivedSearch.title.trim().toLowerCase()
    const destinationQuery = archivedSearch.destination.trim().toLowerCase()
    const dateQuery = archivedSearch.date.trim()

    return archivedTrips.filter((trip) => {
      const matchesTitle = titleQuery
        ? trip.title.toLowerCase().includes(titleQuery)
        : true
      const matchesDestination = destinationQuery
        ? (trip.destination ?? '').toLowerCase().includes(destinationQuery)
        : true
      const matchesDate = dateQuery
        ? dateQuery >= trip.start_date && dateQuery <= trip.end_date
        : true

      return matchesTitle && matchesDestination && matchesDate
    })
  }, [archivedTrips, archivedSearch])
  const totalArchivedPages = useMemo(
    () => Math.max(1, Math.ceil(filteredArchivedTrips.length / archivedPageSize)),
    [filteredArchivedTrips.length, archivedPageSize],
  )
  const paginatedArchivedTrips = useMemo(() => {
    const start = (archivedPage - 1) * archivedPageSize
    return filteredArchivedTrips.slice(start, start + archivedPageSize)
  }, [filteredArchivedTrips, archivedPage, archivedPageSize])

  useEffect(() => {
    setArchivedPage(1)
  }, [archivedSearch.title, archivedSearch.destination, archivedSearch.date, archivedPageSize])

  useEffect(() => {
    if (archivedPage > totalArchivedPages) {
      setArchivedPage(totalArchivedPages)
    }
  }, [archivedPage, totalArchivedPages])

  const goToPreviousArchivedPage = () => {
    setArchivedPage((prev) => Math.max(1, prev - 1))
  }

  const goToNextArchivedPage = () => {
    setArchivedPage((prev) => Math.min(totalArchivedPages, prev + 1))
  }

  const openCreateModal = () => {
    setOpenDatasetMenuId(null)
    setFormModal({ mode: 'create' })
    setFormState(defaultFormState())
    setFormError(null)
  }

  const openEditModal = (trip: TravelTrip) => {
    setOpenDatasetMenuId(null)
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

  const openArchivedModal = () => {
    setOpenDatasetMenuId(null)
    setArchivedModalOpen(true)
  }

  const closeArchivedModal = () => {
    setOpenDatasetMenuId(null)
    setArchivedModalOpen(false)
  }

  const handleArchivedSearchChange = (
    field: keyof typeof archivedSearch,
    value: string,
  ) => {
    setArchivedSearch((prev) => ({ ...prev, [field]: value }))
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

  const toggleCollection = useCallback((invoiceId: number) => {
    setExpandedCollections((prev) =>
      prev.includes(invoiceId)
        ? prev.filter((id) => id !== invoiceId)
        : [...prev, invoiceId],
    )
  }, [])

  const toggleDatasetMenu = useCallback((tripId: number) => {
    setOpenDatasetMenuId((prev) => (prev === tripId ? null : tripId))
  }, [])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-dataset-menu]')) {
        return
      }
      setOpenDatasetMenuId(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => {
      document.removeEventListener('mousedown', handleClick)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDatasetMenuId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const handleDelete = async (trip: TravelTrip) => {
    const confirmed = window.confirm(`Dienstreise "${trip.title}" wirklich löschen?`)
    if (!confirmed) return
    setOpenDatasetMenuId(null)
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
    setOpenDatasetMenuId(null)
    setUploadTrip(trip)
    setUploadDrafts([])
    setUploadError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const closeUploadModal = () => {
    setUploadTrip(null)
    setUploadDrafts([])
    setUploadError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleUploadSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!uploadTrip) return
    if (uploadDrafts.length === 0) {
      setUploadError('Bitte füge mindestens eine Datei zum Hochladen hinzu.')
      return
    }

    setUploading(true)
    setUploadError(null)
    setGlobalError(null)

    try {
      for (const draft of uploadDrafts) {
        await uploadTravelDocument(uploadTrip.id, {
          document_type: draft.document_type,
          comment: draft.comment.trim() || undefined,
          file: draft.file,
        })
      }
      await loadTrips()
      closeUploadModal()
    } catch (error) {
      console.error('Dokumente konnten nicht hochgeladen werden', error)
      setUploadError('Dokumente konnten nicht hochgeladen werden.')
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

  const handleCollectionLabel = async (trip: TravelTrip, document: TravelDocument) => {
    const next = window.prompt(
      'Sammelbegriff festlegen (leer lassen, um zu entfernen)',
      document.collection_label ?? '',
    )
    if (next === null) return
    const trimmed = next.trim()
    setGlobalError(null)
    setUpdatingDocId(document.id)
    try {
      await updateTravelDocument(trip.id, document.id, {
        collection_label: trimmed.length > 0 ? trimmed : null,
      })
      await loadTrips()
    } catch (error) {
      console.error('Sammelbegriff konnte nicht gespeichert werden', error)
      setGlobalError('Sammelbegriff konnte nicht gespeichert werden.')
    } finally {
      setUpdatingDocId(null)
    }
  }

  const handleLinkInvoice = async (trip: TravelTrip, document: TravelDocument) => {
    const invoices = trip.documents.filter((item) => item.document_type === 'Rechnung')
    if (invoices.length === 0) {
      window.alert('Es sind keine Rechnungen vorhanden, die verknüpft werden können.')
      return
    }
    const options = invoices
      .map((invoice) => {
        const label = invoice.collection_label ? `${invoice.collection_label} · ` : ''
        return `${invoice.id}: ${label}${invoice.original_name}`
      })
      .join('\n')
    const response = window.prompt(
      `Rechnung auswählen (ID eingeben, leer lassen für keine Verknüpfung):\n${options}`,
      document.linked_invoice_id ? String(document.linked_invoice_id) : '',
    )
    if (response === null) return
    const choice = response.trim()
    let invoiceId: number | null = null
    if (choice !== '') {
      const parsed = Number(choice)
      if (!Number.isInteger(parsed) || !invoices.some((invoice) => invoice.id === parsed)) {
        window.alert('Ungültige Auswahl. Bitte eine der angezeigten IDs verwenden.')
        return
      }
      invoiceId = parsed
    }
    setGlobalError(null)
    setUpdatingDocId(document.id)
    try {
      await updateTravelDocument(trip.id, document.id, { linked_invoice_id: invoiceId })
      await loadTrips()
    } catch (error) {
      console.error('Verknüpfung konnte nicht gespeichert werden', error)
      setGlobalError('Verknüpfung konnte nicht gespeichert werden.')
    } finally {
      setUpdatingDocId(null)
    }
  }

  const handleUnlinkInvoice = async (trip: TravelTrip, document: TravelDocument) => {
    setGlobalError(null)
    setUpdatingDocId(document.id)
    try {
      await updateTravelDocument(trip.id, document.id, { linked_invoice_id: null })
      await loadTrips()
    } catch (error) {
      console.error('Verknüpfung konnte nicht entfernt werden', error)
      setGlobalError('Verknüpfung konnte nicht entfernt werden.')
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

  const renderDocumentCard = (
    trip: TravelTrip,
    document: TravelDocument,
    options: { nested?: boolean } = {},
  ) => {
    const isNested = options.nested ?? false
    const isSignable = SIGNABLE_TYPES.has(document.document_type)
    const isUpdating = updatingDocId === document.id
    const linkedInfo =
      document.linked_invoice && document.document_type !== 'Rechnung' && !isNested
        ? `Rechnung: ${document.linked_invoice.original_name}`
        : null

    return (
      <div
        key={document.id}
        className={clsx(
          'rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-3',
          isNested && 'ml-4 border-slate-800/70 bg-slate-950/40',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
              <span>{document.document_type}</span>
              <span>·</span>
              <span>{dayjs(document.created_at).format('DD.MM.YYYY HH:mm')}</span>
              {document.collection_label && (
                <span className="rounded bg-primary/15 px-2 py-0.5 text-[10px] text-primary">
                  {document.collection_label}
                </span>
              )}
              {linkedInfo && (
                <span className="rounded bg-slate-900/70 px-2 py-0.5 text-[10px] text-slate-200">
                  {linkedInfo}
                </span>
              )}
              {isSignable && (
                <span className="rounded bg-slate-900/50 px-2 py-0.5 text-[10px] text-slate-200">
                  {document.signed ? 'Unterschrieben' : 'Nicht unterschrieben'}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-slate-100">{document.original_name}</p>
            <p className="text-xs text-slate-400">
              {document.comment ? document.comment : 'Kein Kommentar hinterlegt.'}
            </p>
            {document.linked_invoice_id && !document.linked_invoice && (
              <p className="text-xs text-amber-300">Zugeordnete Rechnung konnte nicht gefunden werden.</p>
            )}
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
              disabled={isUpdating}
            >
              Kommentar bearbeiten
            </button>
            {document.document_type === 'Rechnung' && (
              <button
                type="button"
                onClick={() => handleCollectionLabel(trip, document)}
                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
                disabled={isUpdating}
              >
                {document.collection_label ? 'Sammelbegriff ändern' : 'Sammelbegriff setzen'}
              </button>
            )}
            {document.document_type === 'Beleg' && (
              <>
                <button
                  type="button"
                  onClick={() => handleLinkInvoice(trip, document)}
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
                  disabled={isUpdating}
                >
                  {document.linked_invoice_id ? 'Rechnung ändern' : 'Rechnung verknüpfen'}
                </button>
                {document.linked_invoice_id && (
                  <button
                    type="button"
                    onClick={() => handleUnlinkInvoice(trip, document)}
                    className="rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-300 hover:border-rose-400 hover:text-rose-200"
                    disabled={isUpdating}
                  >
                    Verknüpfung lösen
                  </button>
                )}
              </>
            )}
            {isSignable && (
              <button
                type="button"
                onClick={() => handleToggleSigned(trip, document)}
                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
                disabled={isUpdating}
              >
                {document.signed ? 'Signatur entfernen' : 'Als unterschrieben markieren'}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleDocumentDelete(trip, document)}
              className="rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-300 hover:border-rose-400 hover:text-rose-200"
              disabled={isUpdating}
            >
              Löschen
            </button>
          </div>
        </div>
      </div>
    )
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

    const receiptsByInvoice = new Map<number, TravelDocument[]>()
    for (const document of trip.documents) {
      if (document.document_type === 'Beleg' && document.linked_invoice_id) {
        const existing = receiptsByInvoice.get(document.linked_invoice_id) ?? []
        existing.push(document)
        receiptsByInvoice.set(document.linked_invoice_id, existing)
      }
    }
    receiptsByInvoice.forEach((documents) => {
      documents.sort((a, b) => dayjs(a.created_at).valueOf() - dayjs(b.created_at).valueOf())
    })

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
                  <button
                    type="button"
                    onClick={() => openLetterModal(trip)}
                    className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
                  >
                    Anschreiben erzeugen
                  </button>
                  <div className="relative" data-dataset-menu>
                    <button
                      type="button"
                      onClick={() => toggleDatasetMenu(trip.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
                      aria-haspopup="menu"
                      aria-expanded={openDatasetMenuId === trip.id}
                    >
                      Reisekostenabrechnungsdatensatz
                      <span aria-hidden="true" className="text-[10px]">▾</span>
                    </button>
                    {openDatasetMenuId === trip.id && (
                      <div
                        className="absolute right-0 z-30 mt-1 w-48 rounded-md border border-slate-800 bg-slate-950/95 p-1 shadow-lg"
                        role="menu"
                      >
                        <a
                          href={travelDatasetDownloadUrl(trip.dataset_path)}
                          className="block rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-900 hover:text-primary"
                          role="menuitem"
                          onClick={() => setOpenDatasetMenuId(null)}
                        >
                          Download als ZIP
                        </a>
                        <a
                          href={travelDatasetPrintUrl(trip.dataset_print_path)}
                          className="mt-1 block rounded px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-900 hover:text-primary"
                          role="menuitem"
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setOpenDatasetMenuId(null)}
                        >
                          Direkt drucken (PDF)
                        </a>
                      </div>
                    )}
                  </div>
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
                <div className="mt-3 space-y-3">
                  {trip.documents
                    .filter((document) => document.document_type !== 'Beleg' || !document.linked_invoice_id)
                    .map((document) => {
                      if (document.document_type === 'Rechnung') {
                        const receipts = receiptsByInvoice.get(document.id) ?? []
                        const hasReceipts = receipts.length > 0
                        const isCollectionExpanded = expandedCollections.includes(document.id)
                        return (
                          <div key={`invoice-block-${document.id}`} className="space-y-2">
                            {renderDocumentCard(trip, document)}
                            {hasReceipts && (
                              <div className="ml-1 rounded-lg border border-slate-800/60 bg-slate-950/40 p-2">
                                <button
                                  type="button"
                                  onClick={() => toggleCollection(document.id)}
                                  className="flex w-full items-center justify-between gap-2 text-xs font-medium text-slate-200"
                                  aria-expanded={isCollectionExpanded}
                                >
                                  <span>
                                    {document.collection_label
                                      ? `${document.collection_label} (${receipts.length} ${
                                          receipts.length === 1 ? 'Beleg' : 'Belege'
                                        })`
                                      : `Verknüpfte Belege (${receipts.length})`}
                                  </span>
                                  <svg
                                    className={clsx(
                                      'h-4 w-4 text-slate-400 transition-transform',
                                      isCollectionExpanded && 'rotate-180',
                                    )}
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
                                </button>
                                {isCollectionExpanded && (
                                  <div className="mt-2 space-y-2">
                                    {receipts.map((receipt) =>
                                      renderDocumentCard(trip, receipt, { nested: true }),
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      }
                      return renderDocumentCard(trip, document)
                    })}
                </div>
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openArchivedModal}
            disabled={archivedTrips.length === 0}
            className="inline-flex items-center rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-primary hover:text-primary disabled:opacity-50"
          >
            Archiviert
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90"
          >
            Neue Dienstreise
          </button>
        </div>
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

      <Lightbox
        open={archivedModalOpen}
        title="Archivierte Dienstreisen"
        onClose={closeArchivedModal}
        contentClassName="max-h-[70vh] overflow-y-auto pr-1"
      >
        <form
          className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 md:grid-cols-3"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Titel
            <input
              type="text"
              value={archivedSearch.title}
              onChange={(event) => handleArchivedSearchChange('title', event.target.value)}
              placeholder="z. B. Konferenz"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Ort
            <input
              type="text"
              value={archivedSearch.destination}
              onChange={(event) => handleArchivedSearchChange('destination', event.target.value)}
              placeholder="z. B. Berlin"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Datum
            <input
              type="date"
              value={archivedSearch.date}
              onChange={(event) => handleArchivedSearchChange('date', event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </label>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <span>
            {filteredArchivedTrips.length} archivierte Reise
            {filteredArchivedTrips.length === 1 ? '' : 'n'} gefunden
          </span>
          <label className="flex items-center gap-2">
            <span>Pro Seite:</span>
            <select
              value={archivedPageSize}
              onChange={(event) => setArchivedPageSize(Number(event.target.value))}
              className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-200 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {[10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filteredArchivedTrips.length === 0 ? (
          <p className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-center text-sm text-slate-400">
            Keine archivierten Dienstreisen gefunden.
          </p>
        ) : (
          <ul className="space-y-4">
            {paginatedArchivedTrips.map((trip) => renderTrip(trip))}
          </ul>
        )}

        {filteredArchivedTrips.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4 text-xs text-slate-400">
            <span>
              Seite {archivedPage} von {totalArchivedPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={goToPreviousArchivedPage}
                disabled={archivedPage === 1}
                className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary disabled:opacity-50"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={goToNextArchivedPage}
                disabled={archivedPage === totalArchivedPages || filteredArchivedTrips.length === 0}
                className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary disabled:opacity-50"
              >
                Weiter
              </button>
            </div>
          </div>
        )}
      </Lightbox>

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
        open={Boolean(letterTrip)}
        title={letterTrip ? `Anschreiben für "${letterTrip.title}"` : 'Anschreiben erstellen'}
        onClose={closeLetterModal}
        contentClassName="max-h-[70vh] overflow-y-auto pr-1"
        footer={
          <>
            <button
              type="button"
              onClick={closeLetterModal}
              className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary hover:text-primary"
              disabled={letterSaving}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              form="travel-letter"
              disabled={letterSaving || letterLoading}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              Anschreiben speichern &amp; herunterladen
            </button>
          </>
        }
      >
        {letterLoading ? (
          <p className="text-sm text-slate-400">Anschreiben wird vorbereitet…</p>
        ) : (
          <form id="travel-letter" className="space-y-5" onSubmit={handleLetterSubmit}>
            {letterError && <p className="text-sm text-rose-300">{letterError}</p>}
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Betreff
              <input
                type="text"
                value={letterSubject}
                onChange={(event) => setLetterSubject(event.target.value)}
                required
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Text
              <textarea
                value={letterBody}
                onChange={(event) => setLetterBody(event.target.value)}
                rows={10}
                required
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            {letterPreview && (
              <div className="grid gap-4 md:grid-cols-2">
                {(
                  [
                    { title: 'Absender', data: letterPreview.sender_contact },
                    { title: 'Personalabteilung', data: letterPreview.hr_contact },
                  ] as const
                ).map(({ title, data }) => {
                  const hasEntries = CONTACT_ORDER.some((field) => data[field])
                  return (
                    <div
                      key={title}
                      className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400"
                    >
                      <h4 className="text-sm font-semibold text-slate-200">{title}</h4>
                      {hasEntries ? (
                        <ul className="mt-2 space-y-1">
                          {CONTACT_ORDER.filter((field) => data[field])
                            .map((field) => (
                              <li key={field} className="flex items-center justify-between gap-2">
                                <span className="uppercase tracking-wide text-slate-500">{CONTACT_LABELS[field]}</span>
                                <span className="text-right text-slate-300">{data[field]}</span>
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-slate-500">Keine Angaben hinterlegt.</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {letterPreview && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-400">
                <h4 className="text-sm font-semibold text-slate-200">Platzhalter-Vorschau</h4>
                <p className="mt-1 text-[11px] text-slate-500">
                  Werte, die aktuell für die Vorlage eingesetzt werden. Leer bedeutet, dass der Platzhalter beim Ersetzen entfallen kann.
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {Object.entries(letterPreview.context)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-2 rounded-md bg-slate-950/70 px-2 py-1"
                      >
                        <code className="text-[11px] text-primary">{`{${key}}`}</code>
                        <span className="max-w-[60%] truncate text-right text-slate-300">{value || '—'}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </form>
        )}
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
              disabled={uploading || uploadDrafts.length === 0}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            >
              Dokument speichern
            </button>
          </>
        }
      >
        <form id="travel-upload" className="grid gap-4" onSubmit={handleUploadSubmit}>
          <div
            onDragOver={handleDragOver}
            onDrop={handleDropFiles}
            className={clsx(
              'flex flex-col items-center justify-center rounded-md border-2 border-dashed border-slate-700 bg-slate-950/50 px-4 py-10 text-center text-sm transition',
              uploading ? 'opacity-50' : 'hover:border-primary/80 hover:bg-slate-900/60',
            )}
          >
            <p className="font-semibold text-slate-100">Dateien hinzufügen</p>
            <p className="mt-2 max-w-xs text-xs text-slate-400">
              Ziehe Dokumente hierher oder
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="ml-1 font-semibold text-primary underline-offset-2 hover:underline"
                disabled={uploading}
              >
                Dateien auswählen
              </button>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
              disabled={uploading}
            />
          </div>

          {uploadDrafts.length > 0 && (
            <div className="space-y-3">
              {uploadDrafts.map((draft) => (
                <div
                  key={draft.id}
                  className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 shadow-inner"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-100">{draft.file.name}</p>
                      <p className="text-xs text-slate-400">
                        {(draft.file.size / 1024 / 1024 >= 1
                          ? `${(draft.file.size / 1024 / 1024).toFixed(1)} MB`
                          : `${Math.max(1, Math.round(draft.file.size / 1024))} KB`)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDraft(draft.id)}
                      className="text-xs font-semibold text-slate-400 hover:text-rose-300"
                      disabled={uploading}
                    >
                      Entfernen
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Dokumenttyp
                      <select
                        value={draft.document_type}
                        onChange={(event) =>
                          updateDraft(draft.id, {
                            document_type: event.target.value as UploadDraft['document_type'],
                          })
                        }
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                        disabled={uploading}
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
                        value={draft.comment}
                        onChange={(event) =>
                          updateDraft(draft.id, { comment: event.target.value })
                        }
                        placeholder="optional"
                        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                        disabled={uploading}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          {uploadError && <p className="text-sm text-rose-300">{uploadError}</p>}
        </form>
      </Lightbox>
    </div>
  )
}
