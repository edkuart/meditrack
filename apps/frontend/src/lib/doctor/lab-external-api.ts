const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

async function extFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
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

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExternalSubmissionStatus =
  | 'RECEIVED' | 'AI_EXTRACTING' | 'DRAFT_READY' | 'VALIDATED' | 'REJECTED'

export type ExtractedValueStatus = 'AI_DRAFT' | 'ACCEPTED' | 'EDITED' | 'REJECTED'

export interface SubmissionFile {
  id:          string
  file_name:   string
  mime_type:   string
  uploaded_at: string
  url?:        string
}

export interface ExtractedValue {
  id:             string
  panel_name:     string
  parameter_name: string
  raw_value:      string | null
  numeric_value:  string | null
  unit:           string | null
  ref_min:        string | null
  ref_max:        string | null
  ref_text:       string | null
  confidence:     string
  raw_text:       string | null
  ai_flag:        'H' | 'L' | 'N' | null
  status:         ExtractedValueStatus
  doctor_value:   string | null
  sort_order:     number
}

export interface ExternalSubmission {
  id:              string
  order_id:        string | null
  patient_id:      string
  status:          ExternalSubmissionStatus
  patient_notes:   string | null
  submitted_at:    string
  reviewed_at:     string | null
  ai_started_at:   string | null
  ai_completed_at: string | null
  patient: {
    first_name:    string | null
    last_name:     string | null
    date_of_birth: string | null
  }
  files:           SubmissionFile[]
  extracted_values:ExtractedValue[]
  extracted_count?: number
  file_count?:      number
}

// ─── Status config ────────────────────────────────────────────────────────────

export const SUBMISSION_STATUS_CONFIG: Record<ExternalSubmissionStatus, {
  label: string; color: string; bg: string
}> = {
  RECEIVED:      { label: 'Recibido',       color: '#d97706', bg: '#fffbeb' },
  AI_EXTRACTING: { label: 'Analizando IA',  color: '#7c3aed', bg: '#f5f3ff' },
  DRAFT_READY:   { label: 'Borrador listo', color: '#2563eb', bg: '#eff6ff' },
  VALIDATED:     { label: 'Validado',       color: '#059669', bg: '#ecfdf5' },
  REJECTED:      { label: 'Rechazado',      color: '#64748b', bg: '#f8fafc' },
}

export const CONFIDENCE_CONFIG = (confidence: number) => {
  if (confidence >= 0.85) return { color: '#059669', bg: '#ecfdf5', label: `${Math.round(confidence * 100)}%` }
  if (confidence >= 0.70) return { color: '#d97706', bg: '#fffbeb', label: `${Math.round(confidence * 100)}%` }
  return { color: '#dc2626', bg: '#fef2f2', label: `${Math.round(confidence * 100)}%` }
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function listExternalSubmissions(
  token: string,
  status?: ExternalSubmissionStatus,
  orderId?: string,
): Promise<ExternalSubmission[]> {
  const params = new URLSearchParams()
  if (status)  params.set('status',   status)
  if (orderId) params.set('order_id', orderId)
  const qs = params.toString() ? `?${params.toString()}` : ''
  return extFetch(`/lab/external-submissions${qs}`, token)
}

export async function getExternalSubmission(token: string, id: string): Promise<ExternalSubmission> {
  return extFetch(`/lab/external-submissions/${id}`, token)
}

export async function triggerAiExtraction(token: string, id: string): Promise<ExternalSubmission> {
  return extFetch(`/lab/external-submissions/${id}/extract`, token, { method: 'POST', body: '{}' })
}

export async function updateExtractedValue(
  token: string,
  submissionId: string,
  valueId: string,
  data: { status: 'ACCEPTED' | 'EDITED' | 'REJECTED'; doctor_value?: string },
): Promise<ExternalSubmission> {
  return extFetch(
    `/lab/external-submissions/${submissionId}/values/${valueId}`,
    token,
    { method: 'PATCH', body: JSON.stringify(data) },
  )
}

export async function validateSubmission(token: string, id: string): Promise<ExternalSubmission> {
  return extFetch(`/lab/external-submissions/${id}/validate`, token, { method: 'POST', body: '{}' })
}
