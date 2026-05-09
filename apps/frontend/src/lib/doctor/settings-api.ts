const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

async function apiFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed')
  return json.data as T
}

// ─── Clinic profile ───────────────────────────────────────────────────────────

export interface ClinicProfile {
  id: string
  name: string
  slug: string
  plan_type: 'free' | 'pro' | 'enterprise'
  status: string
  subscription_current_period_end: string | null
  created_at: string
}

export async function getClinicProfile(token: string): Promise<ClinicProfile> {
  return apiFetch('/settings/clinic', token)
}

export async function updateClinicProfile(token: string, name: string): Promise<ClinicProfile> {
  return apiFetch('/settings/clinic', token, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

// ─── Audit logs ───────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string
  actor_id: string
  actor_type: string
  actor_email: string | null
  action: string
  resource_type: string
  resource_id: string | null
  changes: Record<string, unknown> | null
  context: Record<string, unknown>
  created_at: string
}

export interface AuditLogPage {
  logs: AuditLogEntry[]
  meta: { page: number; limit: number; total: number; pages: number }
}

export async function getAuditLogs(
  token: string,
  params: { page?: number; limit?: number; action?: string; actor_id?: string } = {},
): Promise<AuditLogPage> {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.limit) qs.set('limit', String(params.limit))
  if (params.action) qs.set('action', params.action)
  if (params.actor_id) qs.set('actor_id', params.actor_id)
  return apiFetch(`/settings/audit-logs?${qs}`, token)
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export interface Session {
  id: string
  device_hint: string | null
  created_at: string
  expires_at: string
  used_at: string | null
}

export async function getSessions(token: string): Promise<Session[]> {
  return apiFetch('/settings/sessions', token)
}

export async function revokeSession(token: string, sessionId: string): Promise<void> {
  await apiFetch(`/settings/sessions/${sessionId}`, token, { method: 'DELETE' })
}

export async function revokeAllSessions(token: string): Promise<{ revoked: number }> {
  return apiFetch('/settings/sessions/all', token, { method: 'DELETE' })
}
