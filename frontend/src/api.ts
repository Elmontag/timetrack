import axios from 'axios'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import { API_BASE } from './config'

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
}

export interface DaySummary {
  day: string
  work_seconds: number
  pause_seconds: number
  overtime_seconds: number
}

export interface LeaveEntry {
  id: number
  start_date: string
  end_date: string
  type: string
  comment: string | null
  approved: boolean
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
}

export interface SettingsResponse {
  environment: string
  timezone: string
  locale: string
  storage: string
  allow_ips: string[]
  caldav_url: string | null
  caldav_user: string | null
  caldav_default_cal: string | null
  caldav_password_set: boolean
}

dayjs.extend(duration)

const client = axios.create({
  baseURL: API_BASE,
})

export async function startSession(payload: { project?: string; tags?: string[]; comment?: string }) {
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

export async function listCalendarEvents(params: { from_date?: string; to_date?: string }) {
  const response = await client.get<CalendarEvent[]>('/calendar/events', { params })
  return response.data
}

export async function createCalendarEvent(payload: {
  title: string
  start_time: string
  end_time: string
  location?: string
  description?: string
  participated?: boolean
}) {
  const response = await client.post<CalendarEvent>('/calendar/events', payload)
  return response.data
}

export async function updateCalendarParticipation(eventId: number, participated: boolean) {
  const response = await client.patch<CalendarEvent>(`/calendar/events/${eventId}`, { participated })
  return response.data
}

export async function getSettings() {
  const response = await client.get<SettingsResponse>('/settings')
  return response.data
}

export async function updateSettings(payload: Partial<SettingsResponse> & { caldav_password?: string | null }) {
  const response = await client.put<SettingsResponse>('/settings', payload)
  return response.data
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return '0:00'
  const duration = dayjs.duration(seconds, 'seconds')
  const hours = Math.floor(duration.asHours())
  const minutes = duration.minutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}
