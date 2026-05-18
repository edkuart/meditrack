const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

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

export const DEPARTMENT_TYPE_LABELS: Record<string, string> = {
  GENERAL: 'General',
  LAB: 'Laboratorio',
  RADIOLOGY: 'Radiología',
  PHARMACY: 'Farmacia',
  EMERGENCY: 'Urgencias',
  ICU: 'UCI',
  SURGERY: 'Cirugía',
  PEDIATRICS: 'Pediatría',
  OBSTETRICS: 'Obstetricia',
  CARDIOLOGY: 'Cardiología',
  NEUROLOGY: 'Neurología',
  ONCOLOGY: 'Oncología',
  ORTHOPEDICS: 'Ortopedia',
  PSYCHIATRY: 'Psiquiatría',
  OTHER: 'Otro',
}

export const ROLE_LABELS: Record<string, string> = {
  DOCTOR: 'Médico/a',
  NURSE: 'Enfermero/a',
  ASSISTANT: 'Asistente',
  ADMIN_CLINIC: 'Administrador',
  LAB_TECHNICIAN: 'Técnico de Laboratorio',
  RADIOLOGIST: 'Radiólogo/a',
  PHARMACIST: 'Farmacéutico/a',
  RECEPTIONIST: 'Recepcionista',
  WARD_NURSE: 'Enfermero/a de Sala',
}

export interface DepartmentMemberUser {
  id: string
  first_name: string
  last_name: string
  role: string
  specialty: string | null
  email?: string
}

export interface Department {
  id: string
  name: string
  type: string
  is_active: boolean
  location_id: string | null
  head_doctor: DepartmentMemberUser | null
  members: { user: DepartmentMemberUser; joined_at: string }[]
}

export async function listDepartments(token: string): Promise<Department[]> {
  return apiFetch('/departments', token)
}

export async function createDepartment(token: string, data: {
  name: string
  type: string
  head_doctor_id?: string
  location_id?: string
}): Promise<Department> {
  return apiFetch('/departments', token, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateDepartment(token: string, id: string, data: {
  name?: string
  type?: string
  head_doctor_id?: string | null
  location_id?: string | null
  is_active?: boolean
}): Promise<Department> {
  return apiFetch(`/departments/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function deleteDepartment(token: string, id: string): Promise<void> {
  return apiFetch(`/departments/${id}`, token, { method: 'DELETE' })
}

export async function addMember(token: string, departmentId: string, userId: string): Promise<void> {
  return apiFetch(`/departments/${departmentId}/members`, token, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  })
}

export async function removeMember(token: string, departmentId: string, userId: string): Promise<void> {
  return apiFetch(`/departments/${departmentId}/members/${userId}`, token, {
    method: 'DELETE',
  })
}

export async function upgradeTenantToHospital(token: string): Promise<{ message: string }> {
  return apiFetch('/hospital/upgrade', token, { method: 'POST' })
}
