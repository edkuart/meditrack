const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

export type NotificationChannel = 'email' | 'sms' | 'whatsapp' | 'push'

export type NotificationType =
  | 'DOSE_REMINDER'
  | 'DOSE_MISSED'
  | 'TREATMENT_STARTING'
  | 'TREATMENT_ENDING'
  | 'APPOINTMENT'
  | 'WELCOME'
  | 'MAGIC_LINK'

export type NotificationStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'BOUNCED'

export type NotificationEntry = {
  id: string
  patient_id: string
  patient_name: string
  channel: NotificationChannel
  type: NotificationType
  status: NotificationStatus
  recipient: string
  attempt_count: number
  failed_reason: string | null
  created_at: string
  sent_at: string | null
}

export type NotificationsResponse = {
  data: NotificationEntry[]
  meta: { total: number; failed: number }
}

export async function fetchClinicNotifications(
  token: string,
  limit = 40,
): Promise<NotificationsResponse> {
  const res = await fetch(`${API}/notifications?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`notifications fetch failed: ${res.status}`)
  const json = await res.json()
  return { data: json.data ?? [], meta: json.meta ?? { total: 0, failed: 0 } }
}
