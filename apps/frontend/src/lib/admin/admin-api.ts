const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

const ADMIN_TOKEN_KEY = 'meditrack_admin_token'

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ADMIN_TOKEN_KEY)
}

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token)
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY)
  localStorage.removeItem('meditrack_admin_refresh_token')
}

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAdminToken()
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed')
  return json as T
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export async function adminLogin(email: string, password: string) {
  const res = await fetch(`${API}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Error de autenticación')
  return json.data as { access_token: string; refresh_token: string; user: AdminUser }
}

export interface AdminUser {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
}

// ─── Metrics ───────────────────────────────────────────────────────────────────

export interface AdminMetrics {
  doctors: { total: number; pending_verification: number }
  tenants: { total: number; active: number }
}

export async function fetchMetrics(): Promise<{ data: AdminMetrics }> {
  return adminFetch('/admin/metrics')
}

// ─── Users ─────────────────────────────────────────────────────────────────────

export type UserStatus = 'pending' | 'verified' | 'rejected' | 'all'

export interface PendingDoctor {
  id: string
  email: string
  first_name: string
  last_name: string
  colegiado_number: string | null
  professional_id: string | null
  specialty: string | null
  dpi_document_key: string | null
  is_verified: boolean
  verification_rejected_at: string | null
  verification_rejected_reason: string | null
  created_at: string
  role: string
  tenant: { id: string; name: string; slug: string }
}

export async function fetchUsers(status: UserStatus = 'pending', page = 1) {
  return adminFetch<{ data: PendingDoctor[]; meta: { total: number; page: number; limit: number } }>(
    `/admin/users?status=${status}&page=${page}`
  )
}

export async function verifyDoctor(userId: string) {
  return adminFetch(`/admin/users/${userId}/verify`, { method: 'POST' })
}

export async function rejectDoctor(userId: string, reason: string) {
  return adminFetch(`/admin/users/${userId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

// ─── Tenants ───────────────────────────────────────────────────────────────────

export interface Tenant {
  id: string
  name: string
  slug: string
  plan_type: 'free' | 'pro' | 'enterprise'
  status: 'active' | 'suspended' | 'cancelled'
  created_at: string
}

export async function fetchTenants(page = 1) {
  return adminFetch<{ data: Tenant[]; meta: { total: number; page: number; limit: number } }>(
    `/admin/tenants?page=${page}`
  )
}

export async function updateTenant(tenantId: string, data: Partial<Pick<Tenant, 'plan_type' | 'status'>>) {
  return adminFetch(`/admin/tenants/${tenantId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}
