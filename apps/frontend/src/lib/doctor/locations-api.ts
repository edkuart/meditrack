const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

async function apiFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocationDepartment {
  id: string
  name: string
  type: string
  is_active: boolean
}

export interface Location {
  id: string
  tenant_id: string
  name: string
  address: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  departments: LocationDepartment[]
}

export interface CreateLocationData {
  name: string
  address?: string
  phone?: string
}

export interface UpdateLocationData {
  name?: string
  address?: string
  phone?: string
}

// ─── API calls ────────────────────────────────────────────────────────────────

export function listLocations(token: string): Promise<Location[]> {
  return apiFetch('/locations', token)
}

export function getLocation(token: string, id: string): Promise<Location> {
  return apiFetch(`/locations/${id}`, token)
}

export function createLocation(token: string, data: CreateLocationData): Promise<Location> {
  return apiFetch('/locations', token, { method: 'POST', body: JSON.stringify(data) })
}

export function updateLocation(token: string, id: string, data: UpdateLocationData): Promise<Location> {
  return apiFetch(`/locations/${id}`, token, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deactivateLocation(token: string, id: string): Promise<null> {
  return apiFetch(`/locations/${id}`, token, { method: 'DELETE' })
}
