const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

export class PortalApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'PortalApiError'
    this.status = status
  }
}

export function isUnauthorizedPortalError(error: unknown) {
  return error instanceof PortalApiError && error.status === 401
}

async function portalFetch<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  })
  const json = await res.json()
  if (!json.success) throw new PortalApiError(json.error?.message ?? 'Request failed', res.status)
  return json.data as T
}

export async function authMagicLink(token: string) {
  const res = await fetch(`${API}/portal/auth/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Invalid link')
  return json.data as { session_token: string; patient: { id: string; first_name: string; last_name: string } }
}

export async function authPin(patient_id: string, pin: string) {
  const res = await fetch(`${API}/portal/auth/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patient_id, pin }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'PIN incorrecto')
  return json.data as { session_token: string; patient: { id: string; first_name: string; last_name: string } }
}

export interface DoseEvent {
  id: string
  scheduled_at: string
  status: 'PENDING' | 'CONFIRMED' | 'MISSED' | 'SKIPPED' | 'CANCELLED'
  confirmed_at: string | null
  can_edit_until: string
  medication_item: {
    drug_name: string
    presentation: string | null
    dose_amount: number
    dose_unit: string
    with_food: boolean
    special_instructions: string | null
  }
}

export type CheckInSeverity = 'OK' | 'WATCH' | 'ALERT'
export type CheckInMood = 'better' | 'same' | 'worse'

export interface PatientCheckIn {
  id: string
  check_in_date: string
  pain_score: number | null
  temperature_c: number | null
  symptoms: string[]
  red_flags: string[]
  medication_issue: boolean
  mood: CheckInMood | null
  notes: string | null
  severity: CheckInSeverity
  created_at: string
  updated_at: string
}

export interface PatientCheckInInput {
  pain_score?: number | null
  temperature_c?: number | null
  symptoms: string[]
  red_flags: string[]
  medication_issue: boolean
  mood?: CheckInMood | null
  notes?: string | null
}

export interface TreatmentPlan {
  id: string
  name: string
  start_date: string
  end_date: string | null
  status: string
  instructions: string | null
  medications: Array<{
    id: string
    drug_name: string
    presentation: string | null
    dose_amount: number
    dose_unit: string
    frequency_type: string
    times_per_day: string[] | null
    special_instructions: string | null
    with_food: boolean
  }>
  interventions: Array<{
    id: string
    type: string
    title: string
    frequency: string | null
    duration: string | null
    instructions: string | null
  }>
}

export async function getMe(token: string) {
  return portalFetch<{ id: string; first_name: string; last_name: string }>(
    '/portal/me', token,
  )
}

export async function getTodayDoses(token: string) {
  return portalFetch<DoseEvent[]>('/portal/doses/today', token)
}

export async function getTodayCheckIn(token: string) {
  return portalFetch<PatientCheckIn | null>('/portal/check-ins/today', token)
}

export async function submitCheckIn(token: string, input: PatientCheckInInput) {
  return portalFetch<PatientCheckIn>('/portal/check-ins', token, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getActiveTreatment(token: string) {
  return portalFetch<TreatmentPlan | null>('/portal/treatment', token)
}

export async function getActiveTreatments(token: string) {
  return portalFetch<TreatmentPlan[]>('/portal/treatments', token)
}

export async function confirmDose(token: string, doseId: string) {
  return portalFetch<DoseEvent>(`/portal/doses/${doseId}/confirm`, token, { method: 'POST', body: JSON.stringify({}) })
}

export async function getAdherence(token: string) {
  return portalFetch<{
    score: number; confirmed: number; total: number
    missed: number; avatar_state: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'
  }>('/portal/adherence', token)
}

export interface PatientEngagement {
  score: number
  confirmed: number
  total: number
  missed: number
  streak_days: number
  weekly_completed_days: number
  tone: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR'
  headline: string
  guidance: string
  next_action: {
    label: string
    detail: string
    priority: 'calm' | 'today' | 'support'
  }
  caregiver_tip: string
  week: Array<{
    date: string
    confirmed: number
    total: number
    score: number
  }>
}

export async function getEngagement(token: string) {
  return portalFetch<PatientEngagement>('/portal/engagement', token)
}

export async function getHistory(token: string) {
  return portalFetch<Array<{
    id: string; encounter_type: string; status: string
    chief_complaint: string | null; summary: string | null
    opened_at: string; closed_at: string | null
    doctor: { first_name: string; last_name: string; specialty: string | null }
  }>>('/portal/history', token)
}

export interface PatientDocument {
  id: string
  type: string
  file_name: string
  mime_type: string
  created_at: string
}

export type PortalLabOrderStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type PortalLabResultStatus = 'PENDING' | 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL_HIGH' | 'CRITICAL_LOW'

export interface PortalLabOrder {
  id: string
  status: PortalLabOrderStatus
  notes: string | null
  ordered_at: string
  updated_at: string
  doctor: { first_name: string; last_name: string; specialty: string | null }
  results: Array<{
    id: string
    panel_name: string
    parameter_name: string
    value: string | null
    unit: string | null
    status: PortalLabResultStatus
    sort_order: number
  }>
}

export async function getDocuments(token: string) {
  return portalFetch<PatientDocument[]>('/portal/documents', token)
}

export async function getLabOrders(token: string) {
  return portalFetch<PortalLabOrder[]>('/portal/lab/orders', token)
}

export async function getDocumentUrl(token: string, documentId: string) {
  return portalFetch<{ url: string; expires_in_seconds: number; file_name: string; mime_type: string }>(
    `/portal/documents/${documentId}/url`, token,
  )
}
