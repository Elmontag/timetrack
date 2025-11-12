import axios from 'axios'
import { API_BASE } from './config'

export type SessionNoteType = 'start' | 'runtime'

export interface SessionNote {
  id: number
  session_id: number
  note_type: SessionNoteType
  content: string
  created_at: string
}

export interface WorkSession {
  id: number
  start_time: string
  stop_time: string | null
  status: string
  project: string | null
  tags: string[]
  comment: string | null
  paused_duration: number
  total_seconds: number | null
  last_pause_start: string | null
  notes: SessionNote[]
}

export interface DaySummary {
  day: string
  work_seconds: number
  pause_seconds: number
  overtime_seconds: number
  expected_seconds: number
  vacation_seconds: number
  sick_seconds: number
  is_weekend: boolean
  is_holiday: boolean
  holiday_name: string | null
  leave_types: string[]
  baseline_expected_seconds?: number | null
}

export interface LeaveEntry {
  id: number
  start_date: string
  end_date: string
  type: string
  comment: string | null
  approved: boolean
  day_count: number
}

export interface ExportRecord {
  id: number
  type: string
  format: string
  range_start: string
  range_end: string
  created_at: string
  path: string
}

export interface CalendarEvent {
  id: number
  title: string
  start_time: string
  end_time: string
  location: string | null
  description: string | null
  participated: boolean
  status: string
  ignored: boolean
  attendees: string[]
}

export interface TravelInvoiceReference {
  id: number
  document_type: string
  original_name: string
  created_at: string
}

export interface TravelDocument {
  id: number
  trip_id: number
  document_type: string
  original_name: string
  comment: string | null
  signed: boolean
  collection_label: string | null
  linked_invoice_id: number | null
  linked_invoice: TravelInvoiceReference | null
  sort_index: number
  created_at: string
  download_path: string
  open_path: string
}

export interface TravelTrip {
  id: number
  title: string
  start_date: string
  end_date: string
  destination: string | null
  purpose: string | null
  workflow_state: string
  notes: string | null
  created_at: string
  updated_at: string
  documents: TravelDocument[]
  dataset_path: string
  dataset_print_path: string
}

export interface TravelContact {
  name: string | null
  company: string | null
  department: string | null
  street: string | null
  postal_code: string | null
  city: string | null
  phone: string | null
  email: string | null
}

export interface TravelLetterTemplate {
  subject: string
  body: string
}

export type TimeDisplayFormat = 'hh:mm' | 'decimal'

export interface SettingsResponse {
  environment: string
  timezone: string
  locale: string
  storage: string
  block_ips: string[]
  caldav_url: string | null
  caldav_user: string | null
  caldav_default_cal: string | null
  caldav_selected_calendars: string[]
  caldav_password_set: boolean
  expected_daily_hours: number | null
  expected_weekly_hours: number | null
  vacation_days_per_year: number
  vacation_days_carryover: number
  day_overview_refresh_seconds: number
  time_display_format: TimeDisplayFormat
  travel_sender_contact: TravelContact
  travel_hr_contact: TravelContact
  travel_letter_template: TravelLetterTemplate
}

export interface CalDavCalendar {
  id: string
  name: string
}

export interface HolidayEntry {
  id: number
  day: string
  name: string
  source: string
}

export interface ActionTokenCreated {
  id: number
  scope: string
  expires_at: string | null
  single_use: boolean
  remaining_uses: number | null
  created_at: string
  token: string
}

export interface Task {
  id: number
  day: string
  title: string
  start_time: string | null
  end_time: string | null
  project: string | null
  tags: string[]
  note: string | null
}

const client = axios.create({
  baseURL: API_BASE,
})

export async function startSession(payload: {
  start_time?: string
  project?: string
  tags?: string[]
  comment?: string
}) {
  const response = await client.post<WorkSession>('/work/start', payload)
  return response.data
}

export async function pauseSession() {
  const response = await client.post<{ action: string; session: WorkSession }>('/work/pause')
  return response.data
}

export async function stopSession(payload: { comment?: string }) {
  const response = await client.post<WorkSession>('/work/stop', payload)
  return response.data
}

export async function createManualSession(payload: {
  start_time: string
  end_time: string
  project?: string
  tags?: string[]
  comment?: string
}) {
  const response = await client.post<WorkSession>('/work/manual', payload)
  return response.data
}

export async function getSessionsForDay(day: string) {
  const response = await client.get<WorkSession[]>(`/work/day/${day}`)
  return response.data
}

export async function createSessionNote(
  sessionId: number,
  payload: { content: string; note_type?: SessionNoteType; created_at?: string },
) {
  const response = await client.post<SessionNote>(`/work/session/${sessionId}/notes`, payload)
  return response.data
}

export async function updateSession(
  sessionId: number,
  payload: {
    start_time?: string | null
    end_time?: string | null
    project?: string | null
    tags?: string[] | null
    comment?: string | null
  },
) {
  const response = await client.patch<WorkSession>(`/work/session/${sessionId}`, payload)
  return response.data
}

export async function deleteSession(sessionId: number) {
  await client.delete(`/work/session/${sessionId}`)
}

export async function getDaySummaries(from: string, to: string) {
  const response = await client.get<DaySummary[]>('/days', { params: { from_date: from, to_date: to } })
  return response.data
}

export async function createLeave(payload: { start_date: string; end_date: string; type: string; comment?: string; approved?: boolean }) {
  const response = await client.post<LeaveEntry>('/leaves', payload)
  return response.data
}

export async function listLeaves(params: { from_date?: string; to_date?: string; type?: string }) {
  const response = await client.get<LeaveEntry[]>('/leaves', { params })
  return response.data
}

export async function createExport(payload: { type: string; format: 'pdf' | 'xlsx'; range_start: string; range_end: string }) {
  const response = await client.post<ExportRecord>('/exports', payload)
  return response.data
}

export async function listHolidays(params: { from_date?: string; to_date?: string } = {}) {
  const response = await client.get<HolidayEntry[]>('/holidays', { params })
  return response.data
}

export async function createHoliday(payload: { day: string; name: string }) {
  const response = await client.post<HolidayEntry>('/holidays', payload)
  return response.data
}

export async function deleteHoliday(holidayId: number) {
  await client.delete(`/holidays/${holidayId}`)
}

export async function importHolidaysFromIcs(content: string) {
  const response = await client.post<HolidayEntry[]>('/holidays/import', { content })
  return response.data
}

export async function listCalendarEvents(params: { from_date?: string; to_date?: string }) {
  const response = await client.get<CalendarEvent[]>('/calendar/events', { params })
  return response.data
}

export async function listTasks(day: string) {
  const response = await client.get<Task[]>(`/work/subtracks/${day}`)
  return response.data
}

export async function createTask(payload: {
  day: string
  title: string
  start_time?: string
  end_time?: string
  project?: string | null
  tags?: string[]
  note?: string | null
}) {
  const response = await client.post<Task>('/work/subtracks', payload)
  return response.data
}

export async function updateTask(
  taskId: number,
  payload: {
    day?: string | null
    title?: string | null
    start_time?: string | null
    end_time?: string | null
    project?: string | null
    tags?: string[] | null
    note?: string | null
  },
) {
  const response = await client.patch<Task>(`/work/subtracks/${taskId}`, payload)
  return response.data
}

export async function deleteTask(taskId: number) {
  await client.delete(`/work/subtracks/${taskId}`)
}

export async function createCalendarEvent(payload: {
  title: string
  start_time: string
  end_time: string
  location?: string
  description?: string
  participated?: boolean
  status?: string
  attendees?: string[]
}) {
  const response = await client.post<CalendarEvent>('/calendar/events', payload)
  return response.data
}

export async function updateCalendarEvent(
  eventId: number,
  payload: { participated?: boolean; status?: string; ignored?: boolean },
) {
  const response = await client.patch<CalendarEvent>(`/calendar/events/${eventId}`, payload)
  return response.data
}

export async function getSettings() {
  const response = await client.get<SettingsResponse>('/settings')
  return response.data
}

export async function updateSettings(
  payload: Partial<SettingsResponse> & { caldav_password?: string | null }
) {
  const response = await client.put<SettingsResponse>('/settings', payload)
  return response.data
}

export async function createActionToken(payload: {
  scope: string
  ttl_minutes?: number
  single_use?: boolean
  max_uses?: number | null
  ip_bind?: string | null
}) {
  const response = await client.post<ActionTokenCreated>('/tokens', payload)
  return response.data
}

export async function getCaldavCalendars() {
  const response = await client.get<CalDavCalendar[]>('/caldav/calendars')
  return response.data
}

export async function listTravels() {
  const response = await client.get<TravelTrip[]>('/travels')
  return response.data
}

export async function createTravel(payload: {
  title: string
  start_date: string
  end_date: string
  destination?: string | null
  purpose?: string | null
  workflow_state?: string | null
  notes?: string | null
}) {
  const response = await client.post<TravelTrip>('/travels', payload)
  return response.data
}

export async function updateTravel(
  tripId: number,
  payload: Partial<{
    title: string
    start_date: string
    end_date: string
    destination: string | null
    purpose: string | null
    workflow_state: string | null
    notes: string | null
  }>,
) {
  const response = await client.put<TravelTrip>(`/travels/${tripId}`, payload)
  return response.data
}

export async function deleteTravel(tripId: number) {
  await client.delete(`/travels/${tripId}`)
}

export interface TravelLetterPreview {
  subject: string
  body: string
  context: Record<string, string>
  sender_contact: TravelContact
  hr_contact: TravelContact
}

export async function getTravelLetterPreview(tripId: number) {
  const response = await client.get<TravelLetterPreview>(`/travels/${tripId}/anschreiben`)
  return response.data
}

export async function createTravelLetter(
  tripId: number,
  payload: { subject: string; body: string },
) {
  const response = await client.post<TravelDocument>(`/travels/${tripId}/anschreiben`, payload)
  return response.data
}

export interface UploadTravelDocumentPayload {
  document_type: string
  comment?: string | null
  file: File
  collection_label?: string | null
  linked_invoice_id?: number | null
}

export async function uploadTravelDocument(tripId: number, payload: UploadTravelDocumentPayload) {
  const formData = new FormData()
  formData.append('document_type', payload.document_type)
  if (payload.comment) {
    formData.append('comment', payload.comment)
  }
  if (payload.collection_label) {
    formData.append('collection_label', payload.collection_label)
  }
  if (typeof payload.linked_invoice_id === 'number') {
    formData.append('linked_invoice_id', String(payload.linked_invoice_id))
  }
  formData.append('file', payload.file)
  const response = await client.post<TravelDocument>(`/travels/${tripId}/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export async function updateTravelDocument(
  tripId: number,
  documentId: number,
  payload: { comment?: string | null; signed?: boolean; collection_label?: string | null; linked_invoice_id?: number | null },
) {
  const response = await client.patch<TravelDocument>(
    `/travels/${tripId}/documents/${documentId}`,
    payload,
  )
  return response.data
}

export async function reorderTravelDocuments(tripId: number, order: number[]) {
  const response = await client.post<TravelTrip>(`/travels/${tripId}/documents/reorder`, { order })
  return response.data
}

export async function deleteTravelDocument(tripId: number, documentId: number) {
  await client.delete(`/travels/${tripId}/documents/${documentId}`)
}

export function travelDocumentDownloadUrl(tripId: number, documentId: number) {
  return `${API_BASE}/travels/${tripId}/documents/${documentId}/download`
}

export function travelDocumentOpenUrl(tripId: number, documentId: number) {
  return `${API_BASE}/travels/${tripId}/documents/${documentId}/open`
}

export function travelDatasetDownloadUrl(datasetPath: string) {
  return `${API_BASE}${datasetPath}`
}

export function travelDatasetPrintUrl(datasetPrintPath: string) {
  return `${API_BASE}${datasetPrintPath}`
}
