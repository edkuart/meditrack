const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

async function apiFetch<T>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed')
  return json.data as T
}

async function publicFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed')
  return json.data as T
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type StaffRole =
  | 'ADMIN_CLINIC' | 'DOCTOR' | 'NURSE' | 'ASSISTANT'
  | 'LAB_TECHNICIAN' | 'RADIOLOGIST' | 'PHARMACIST'
  | 'RECEPTIONIST' | 'WARD_NURSE'

export interface CustomRole {
  id: string
  name: string
  description: string | null
  base_role: StaffRole
  permissions: string[]
  is_active?: boolean
  is_system?: boolean
  created_at?: string
  updated_at?: string
}

export interface StaffMember {
  id: string
  email: string
  first_name: string
  last_name: string
  role: StaffRole
  custom_role_id: string | null
  custom_role: CustomRole | null
  specialty: string | null
  is_active: boolean
  is_verified: boolean
  created_at: string
}

export interface PendingInvitation {
  id: string
  email: string
  role: StaffRole
  custom_role_id: string | null
  custom_role: CustomRole | null
  expires_at: string
  created_at: string
}

export interface StaffList {
  staff: StaffMember[]
  pending_invitations: PendingInvitation[]
}

export interface StaffRolesList {
  system_roles: CustomRole[]
  custom_roles: CustomRole[]
}

export interface InviteResult {
  email: string
  role: StaffRole
  custom_role_id: string | null
  custom_role: CustomRole | null
  expires_at: string
}

export interface AcceptInviteResult {
  user: {
    id: string
    email: string
    first_name: string
    last_name: string
    role: StaffRole
    custom_role_id: string | null
    tenant_id: string
    permissions: string[]
  }
  access_token: string
  refresh_token?: string
}

// ─── API calls ────────────────────────────────────────────────────────────────

export function listStaff(token: string): Promise<StaffList> {
  return apiFetch('/staff', token)
}

export function listStaffRoles(token: string): Promise<StaffRolesList> {
  return apiFetch('/staff/roles', token)
}

export function createCustomRole(
  token: string,
  data: { name: string; description?: string; base_role: StaffRole; permissions: string[] },
): Promise<CustomRole> {
  return apiFetch('/staff/roles', token, { method: 'POST', body: JSON.stringify(data) })
}

export function updateCustomRole(
  token: string,
  roleId: string,
  data: Partial<{ name: string; description: string; base_role: StaffRole; permissions: string[] }>,
): Promise<CustomRole> {
  return apiFetch(`/staff/roles/${roleId}`, token, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteCustomRole(token: string, roleId: string): Promise<null> {
  return apiFetch(`/staff/roles/${roleId}`, token, { method: 'DELETE' })
}

export function inviteStaff(
  token: string,
  data: { email: string; role: StaffRole; custom_role_id?: string; department_id?: string },
): Promise<InviteResult> {
  return apiFetch('/staff/invite', token, { method: 'POST', body: JSON.stringify(data) })
}

export function promoteStaff(
  token: string,
  userId: string,
  role: StaffRole,
  customRoleId?: string | null,
): Promise<{ id: string; email: string; role: StaffRole; custom_role_id: string | null; custom_role: CustomRole | null }> {
  return apiFetch(`/staff/${userId}/role`, token, {
    method: 'PATCH',
    body: JSON.stringify({ role, custom_role_id: customRoleId ?? null }),
  })
}

export function deactivateStaff(token: string, userId: string): Promise<null> {
  return apiFetch(`/staff/${userId}`, token, { method: 'DELETE' })
}

export function cancelInvitation(token: string, invitationId: string): Promise<null> {
  return apiFetch(`/staff/invitations/${invitationId}`, token, { method: 'DELETE' })
}

export function resendInvitation(token: string, invitationId: string): Promise<InviteResult> {
  return apiFetch(`/staff/invitations/${invitationId}/resend`, token, { method: 'POST' })
}

export function acceptInvite(data: {
  token: string
  first_name: string
  last_name: string
  password: string
  specialty?: string
  professional_id?: string
}): Promise<AcceptInviteResult> {
  return publicFetch('/staff/accept-invite', { method: 'POST', body: JSON.stringify(data) })
}
