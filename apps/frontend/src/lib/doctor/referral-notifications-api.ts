const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

export type DoctorNotifType =
  | 'REFERRAL_CREATED'
  | 'REFERRAL_ACCEPTED'
  | 'REFERRAL_REJECTED'
  | 'REFERRAL_COMPLETED'
  | 'REFERRAL_CANCELLED'

export interface DoctorNotification {
  id: string
  tenant_id: string
  recipient_id: string
  referral_id: string
  patient_id: string
  type: DoctorNotifType
  title: string
  body: string
  is_read: boolean
  created_at: string
  patient?: { id: string; first_name: string; last_name: string; mrn: string | null }
}

export interface DoctorNotificationsResponse {
  data: DoctorNotification[]
  meta: { total: number; unread_count: number }
}

async function apiFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options?.headers ?? {}) },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed')
  return json as T
}

export async function fetchDoctorNotifications(token: string, limit = 40): Promise<DoctorNotificationsResponse> {
  return apiFetch(`/doctor-notifications?limit=${limit}`, token)
}

export async function markDoctorNotificationRead(token: string, notifId: string): Promise<void> {
  await apiFetch(`/doctor-notifications/${notifId}/read`, token, { method: 'PATCH' })
}

export async function markAllDoctorNotificationsRead(token: string): Promise<void> {
  await apiFetch('/doctor-notifications/read-all', token, { method: 'POST' })
}
