const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

export type AppointmentType =
  | 'CONSULTATION'
  | 'FOLLOW_UP'
  | 'PROCEDURE'
  | 'CHECK_UP'
  | 'EMERGENCY'
  | 'TELECONSULT'

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'WAITING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'

export type Appointment = {
  id: string
  patient_id: string
  doctor_id: string
  location_id: string | null
  scheduled_at: string
  duration_minutes: number
  type: AppointmentType
  status: AppointmentStatus
  reason: string | null
  notes: string | null
  cancelled_reason: string | null
  created_at: string
  updated_at: string
  patient: {
    first_name: string
    last_name: string
    date_of_birth: string | null
    sex: string | null
  }
  doctor: {
    first_name: string
    last_name: string
    specialty: string | null
  }
  location: {
    name: string
    address: string | null
  } | null
}

export type CreateAppointmentInput = {
  patient_id: string
  doctor_id: string
  location_id?: string
  scheduled_at: string
  duration_minutes?: number
  type?: AppointmentType
  reason?: string
  notes?: string
}

export type UpdateAppointmentInput = {
  location_id?: string | null
  scheduled_at?: string
  duration_minutes?: number
  type?: AppointmentType
  reason?: string | null
  notes?: string | null
}

async function apiFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: { message?: string } })?.error?.message ?? `Request failed: ${res.status}`)
  }
  const json = await res.json()
  return json.data as T
}

export async function listAppointments(
  token: string,
  params?: {
    from?: string
    to?: string
    doctor_id?: string
    patient_id?: string
    status?: AppointmentStatus
    limit?: number
  },
): Promise<Appointment[]> {
  const qs = new URLSearchParams()
  if (params?.from)       qs.set('from', params.from)
  if (params?.to)         qs.set('to', params.to)
  if (params?.doctor_id)  qs.set('doctor_id', params.doctor_id)
  if (params?.patient_id) qs.set('patient_id', params.patient_id)
  if (params?.status)     qs.set('status', params.status)
  if (params?.limit)      qs.set('limit', String(params.limit))
  const q = qs.toString()
  return apiFetch<Appointment[]>(token, `/appointments${q ? `?${q}` : ''}`)
}

export async function listPatientAppointments(token: string, patientId: string): Promise<Appointment[]> {
  return apiFetch<Appointment[]>(token, `/patients/${patientId}/appointments`)
}

export async function createAppointment(
  token: string,
  patientId: string,
  input: CreateAppointmentInput,
): Promise<Appointment> {
  return apiFetch<Appointment>(token, `/patients/${patientId}/appointments`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateAppointment(
  token: string,
  id: string,
  input: UpdateAppointmentInput,
): Promise<Appointment> {
  return apiFetch<Appointment>(token, `/appointments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function confirmAppointment(token: string, id: string): Promise<Appointment> {
  return apiFetch<Appointment>(token, `/appointments/${id}/confirm`, { method: 'POST' })
}

export async function waitingAppointment(token: string, id: string): Promise<Appointment> {
  return apiFetch<Appointment>(token, `/appointments/${id}/waiting`, { method: 'POST' })
}

export async function completeAppointment(token: string, id: string): Promise<Appointment> {
  return apiFetch<Appointment>(token, `/appointments/${id}/complete`, { method: 'POST' })
}

export async function noShowAppointment(token: string, id: string): Promise<Appointment> {
  return apiFetch<Appointment>(token, `/appointments/${id}/no-show`, { method: 'POST' })
}

export async function cancelAppointment(token: string, id: string, reason?: string): Promise<Appointment> {
  return apiFetch<Appointment>(token, `/appointments/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}
