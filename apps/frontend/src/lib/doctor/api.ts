const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

async function doctorFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed')
  return json.data as T
}

export interface Document {
  id: string
  type: string
  file_name: string
  file_size: number
  mime_type: string
  is_visible_to_patient: boolean
  encounter_id: string | null
  created_at: string
  uploaded_by_user: { first_name: string; last_name: string }
}

export async function listDocuments(token: string, patientId: string): Promise<Document[]> {
  return doctorFetch(`/patients/${patientId}/documents`, token)
}

export async function getDocumentUrl(token: string, documentId: string) {
  return doctorFetch<{ url: string; expires_in_seconds: number; file_name: string }>(
    `/documents/${documentId}/url`, token,
  )
}

export async function toggleDocumentVisibility(
  token: string, documentId: string, visible: boolean,
) {
  return doctorFetch(`/documents/${documentId}/visibility`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_visible_to_patient: visible }),
  })
}

export async function deleteDocument(token: string, documentId: string) {
  return doctorFetch(`/documents/${documentId}`, token, { method: 'DELETE' })
}

export async function uploadDocument(
  token: string,
  patientId: string,
  file: File,
  meta: { type: string; is_visible_to_patient: boolean; encounter_id?: string },
) {
  const form = new FormData()
  form.append('file', file)
  form.append('type', meta.type)
  form.append('is_visible_to_patient', String(meta.is_visible_to_patient))
  if (meta.encounter_id) form.append('encounter_id', meta.encounter_id)

  const res = await fetch(`${API}/patients/${patientId}/documents`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Upload failed')
  return json.data as Document
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
