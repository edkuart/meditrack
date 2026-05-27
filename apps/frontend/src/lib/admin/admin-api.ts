const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

const ADMIN_TOKEN_KEY = 'meditrack_admin_token'
const ADMIN_REFRESH_TOKEN_KEY = 'meditrack_admin_refresh_token'
let adminCsrfToken: string | null = null

export function getAdminToken(): string | null {
  return null
}

export function setAdminToken(_token?: string) {
  clearLegacyAdminStorage()
}

function clearLegacyAdminStorage() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ADMIN_TOKEN_KEY)
  localStorage.removeItem(ADMIN_REFRESH_TOKEN_KEY)
}

export async function clearAdminSession() {
  adminCsrfToken = null
  clearLegacyAdminStorage()
  try {
    await adminLogout()
  } catch {
    // Logout is best-effort; cookie clearing also happens server-side when reachable.
  }
}

async function adminFetch<T>(path: string, options?: RequestInit, retry = true): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase()
  const headers = new Headers(options?.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers.set('X-CSRF-Token', await getAdminCsrfToken())
  }

  const res = await fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  })

  const json = await res.json().catch(() => null)
  if (res.status === 401 && retry && path !== '/admin/auth/refresh') {
    try {
      adminCsrfToken = null
      await refreshAdminSession()
      return adminFetch<T>(path, options, false)
    } catch {
      clearLegacyAdminStorage()
    }
  }

  if (!json?.success) throw new Error(json?.error?.message ?? 'Request failed')
  return json as T
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

export async function adminLogin(email: string, password: string) {
  const res = await fetch(`${API}/admin/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Error de autenticación')
  return json.data as AdminLoginResult
}

export async function verifyAdminMfa(mfaToken: string, code: string) {
  const res = await fetch(`${API}/admin/auth/mfa/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mfa_token: mfaToken, code }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Error de verificación')
  return json.data as AdminSessionResult
}

export async function refreshAdminSession() {
  adminCsrfToken = null
  const res = await fetch(`${API}/admin/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
  const json = await res.json().catch(() => null)
  if (!json?.success) throw new Error(json?.error?.message ?? 'Sesión expirada')
  return json.data as AdminSessionResult
}

export async function adminLogout() {
  const res = await fetch(`${API}/admin/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error('No se pudo cerrar sesión')
}

export async function fetchAdminMe(): Promise<{ data: { user: AdminUser } }> {
  return adminFetch('/admin/auth/me')
}

async function getAdminCsrfToken() {
  if (adminCsrfToken) return adminCsrfToken

  const res = await fetch(`${API}/admin/auth/csrf`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  })
  const json = await res.json().catch(() => null)
  if (!json?.success) throw new Error(json?.error?.message ?? 'Sesión expirada')

  const token = json.data.csrf_token
  if (typeof token !== 'string') throw new Error('Sesión expirada')

  adminCsrfToken = token
  return token
}

export interface AdminUser {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
  two_fa_enabled?: boolean
}

export interface AdminSessionResult {
  session: 'cookie'
  user: AdminUser
}

export type AdminLoginResult =
  | AdminSessionResult
  | {
      mfa_required: true
      mfa_setup_required: boolean
      mfa_token: string
      totp_secret?: string
      otpauth_url?: string
      user: AdminUser
    }

// ─── Metrics ───────────────────────────────────────────────────────────────────

export interface AdminMetrics {
  doctors: { total: number; pending_verification: number }
  tenants: { total: number; active: number }
  tickets: { password_open: number }
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
  is_active: boolean
  verification_rejected_at: string | null
  verification_rejected_reason: string | null
  last_login_at: string | null
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

export async function updateAdminUserStatus(userId: string, isActive: boolean, reason?: string) {
  return adminFetch<{ data: PendingDoctor }>(`/admin/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive, reason }),
  })
}

// ─── Tenants ───────────────────────────────────────────────────────────────────

export interface Tenant {
  id: string
  name: string
  slug: string
  plan_type: PlanType
  status: 'active' | 'suspended' | 'cancelled'
  created_at: string
  last_login_at?: string | null
  owner?: {
    id: string
    email: string
    first_name: string
    last_name: string
    role: string
  } | null
  usage?: {
    staff: number
    patients: number
  }
}

export type PlanType = 'free' | 'doctor_individual' | 'clinic_complete' | 'pro' | 'enterprise'
export type AccessGrantDuration = '1_day' | '7_days' | '30_days' | '365_days' | 'custom'

export interface TenantAccessGrant {
  id: string
  tenant_id: string
  grant_type: 'trial' | 'promo' | 'manual_override' | 'internal_demo'
  plan_type: PlanType
  status: 'active' | 'expired' | 'revoked' | 'converted'
  starts_at: string
  ends_at: string
  reason: string
  notes: string | null
  max_ai_units_monthly: number | null
  max_organizations: number | null
  max_staff: number | null
  max_patients: number | null
}

export interface CommercialAccount {
  tenant: Tenant
  owner: {
    id: string
    email: string
    first_name: string
    last_name: string
    role: string
  } | null
  active_grant: TenantAccessGrant | null
  grant_history: TenantAccessGrant[]
  commercial_state: {
    trial_status: 'active' | 'expiring' | 'expired' | 'converted' | 'none'
    days_remaining: number | null
    latest_grant_status: TenantAccessGrant['status'] | null
    latest_grant_ended_at: string | null
  }
  usage: {
    organizations: number
    staff: number
    patients: number
    ai: {
      plan: PlanType
      base_plan: PlanType
      access_grant: {
        id: string
        grant_type: string
        starts_at: string
        ends_at: string
        reason: string
      } | null
      period: { starts_at: string }
      limit: number
      used: number
      remaining: number
      event_count: number
    }
  }
  billing: {
    revenue_paid_gtq: number
    revenue_pending_gtq: number
    paid_invoice_count: number
    pending_invoice_count: number
    latest_invoice: CommercialInvoice | null
    latest_pending_invoice: CommercialInvoice | null
  }
}

export interface CommercialInvoice {
  id: string
  tenant_id: string
  invoice_number: string
  status: 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded'
  plan_type: string
  amount_gtq: string
  currency: string
  provider: 'recurrente' | 'stripe' | 'manual'
  period_end: string | null
  paid_at: string | null
  created_at: string
}

export interface CommercialSummary {
  trials: {
    active: number
    expiring: number
    expired: number
    converted: number
    revoked: number
    conversion_rate: number
  }
  paid_tenants: {
    doctor_individual: number
    clinic_complete: number
    total: number
  }
  revenue: {
    paid_total_gtq: number
    paid_this_month_gtq: number
    pending_gtq: number
    by_plan: {
      doctor_individual_gtq: number
      clinic_complete_gtq: number
    }
  }
}

export async function fetchTenants(page = 1) {
  return adminFetch<{ data: Tenant[]; meta: { total: number; page: number; limit: number } }>(
    `/admin/tenants?page=${page}`
  )
}

export async function updateTenant(tenantId: string, data: Partial<Pick<Tenant, 'plan_type' | 'status'>> & { reason?: string }) {
  return adminFetch(`/admin/tenants/${tenantId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function fetchCommercialAccounts(page = 1) {
  return adminFetch<{
    data: CommercialAccount[]
    meta: { total: number; page: number; limit: number }
    summary: CommercialSummary
  }>(
    `/admin/commercial/accounts?page=${page}`
  )
}

export async function expireCommercialAccessGrants() {
  return adminFetch<{ data: { message: string } }>('/admin/commercial/access-grants/expire', {
    method: 'POST',
  })
}

export async function grantTenantAccess(
  tenantId: string,
  data: {
    grant_type?: TenantAccessGrant['grant_type']
    plan_type: Extract<PlanType, 'doctor_individual' | 'clinic_complete'>
    duration: AccessGrantDuration
    ends_at?: string
    reason: string
    notes?: string
    max_ai_units_monthly?: number
    max_organizations?: number
    max_staff?: number
    max_patients?: number
  },
) {
  return adminFetch<{ data: TenantAccessGrant }>(`/admin/tenants/${tenantId}/access-grants`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function revokeTenantAccessGrant(grantId: string, reason: string) {
  return adminFetch<{ data: TenantAccessGrant }>(`/admin/access-grants/${grantId}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function markAdminInvoicePaid(invoiceId: string, notes?: string) {
  return adminFetch<{ data: { message: string } }>(`/admin/billing/invoices/${invoiceId}/mark-paid`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  })
}

export async function cancelAdminInvoice(invoiceId: string, notes?: string) {
  return adminFetch<{ data: { message: string } }>(`/admin/billing/invoices/${invoiceId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  })
}

// ─── Password Tickets ─────────────────────────────────────────────────────────

export type PasswordTicketStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED'

export interface PasswordTicket {
  id: string
  requester_email: string
  requester_name: string | null
  source: 'LOGIN_HELP' | 'AUTHENTICATED_PROFILE'
  status: PasswordTicketStatus
  message: string | null
  admin_notes: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  tenant: { id: string; name: string; slug: string; plan_type?: PlanType; status?: 'active' | 'suspended' | 'cancelled' } | null
  user: {
    id: string
    email: string
    first_name: string
    last_name: string
    role: string
    is_active?: boolean
    is_verified?: boolean
    last_login_at?: string | null
  } | null
  support_context?: {
    open_tickets_for_email: number
    user_status: {
      is_active: boolean
      is_verified: boolean
      last_login_at: string | null
    } | null
    tenant_status: {
      plan_type: PlanType
      status: 'active' | 'suspended' | 'cancelled'
    } | null
    recent_audit: Array<{
      id: string
      action: string
      resource_type: string
      actor_email: string | null
      created_at: string
    }>
  }
}

export async function fetchPasswordTickets(status: PasswordTicketStatus | 'all' = 'OPEN', page = 1) {
  return adminFetch<{ data: PasswordTicket[]; meta: { total: number; page: number; limit: number } }>(
    `/admin/password-tickets?status=${status}&page=${page}`
  )
}

export async function updatePasswordTicket(
  ticketId: string,
  data: Partial<{ status: PasswordTicketStatus; admin_notes: string }>,
) {
  return adminFetch(`/admin/password-tickets/${ticketId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function issuePasswordResetLink(ticketId: string): Promise<{ data: { reset_url: string; expires_at: string } }> {
  return adminFetch(`/admin/password-tickets/${ticketId}/reset-link`, { method: 'POST' })
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export interface AdminAuditLog {
  id: string
  tenant_id: string
  actor_id: string
  actor_type: 'USER' | 'PATIENT' | 'SYSTEM'
  actor_email: string | null
  action: string
  resource_type: string
  resource_id: string | null
  ip_address: string | null
  user_agent: string | null
  changes: Record<string, unknown> | null
  context: Record<string, unknown>
  created_at: string
}

export async function fetchAdminAuditLogs(page = 1) {
  return adminFetch<{ data: AdminAuditLog[]; meta: { total: number; page: number; limit: number } }>(
    `/admin/audit-logs?page=${page}&limit=30`
  )
}
