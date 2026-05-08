const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

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
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed')
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
}

export async function getMe(token: string) {
  return portalFetch<{ id: string; first_name: string; last_name: string }>(
    '/portal/me', token,
  )
}

export async function getTodayDoses(token: string) {
  return portalFetch<DoseEvent[]>('/portal/doses/today', token)
}

export async function getActiveTreatment(token: string) {
  return portalFetch<TreatmentPlan | null>('/portal/treatment', token)
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

export async function getDocuments(token: string) {
  return portalFetch<PatientDocument[]>('/portal/documents', token)
}

export async function getDocumentUrl(token: string, documentId: string) {
  return portalFetch<{ url: string; expires_in_seconds: number; file_name: string; mime_type: string }>(
    `/portal/documents/${documentId}/url`, token,
  )
}
