const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

async function portalFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatientLabOrder {
  id:           string
  status:       'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  notes:        string | null
  ordered_at:   string
  doctor: {
    first_name: string
    last_name:  string
    specialty:  string | null
  }
  results: Array<{
    panel_name:     string
    parameter_name: string
    value:          string | null
    numeric_value:  string | null
    unit:           string | null
    ref_min:        string | null
    ref_max:        string | null
    ref_text:       string | null
    status:         'PENDING' | 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL_HIGH' | 'CRITICAL_LOW'
  }>
}

// Full order detail for print (includes ref ranges)
export type PatientLabOrderFull = PatientLabOrder

export interface PatientExternalSubmission {
  id:            string
  order_id:      string | null
  status:        'RECEIVED' | 'AI_EXTRACTING' | 'DRAFT_READY' | 'VALIDATED' | 'REJECTED'
  patient_notes: string | null
  submitted_at:  string
  reviewed_at:   string | null
  files: Array<{
    id:          string
    file_name:   string
    mime_type:   string
    uploaded_at: string
  }>
}

export const ORDER_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING:     { label: 'Pendiente',  color: '#d97706' },
  IN_PROGRESS: { label: 'En proceso', color: '#2563eb' },
  COMPLETED:   { label: 'Completado', color: '#059669' },
  CANCELLED:   { label: 'Cancelado',  color: '#64748b' },
}

export const SUBMISSION_STATUS_LABELS: Record<string, { label: string; description: string }> = {
  RECEIVED:      { label: 'Recibido',          description: 'Tu médico revisará los documentos pronto.' },
  AI_EXTRACTING: { label: 'Procesando…',       description: 'La IA está analizando tus documentos.' },
  DRAFT_READY:   { label: 'En revisión médica', description: 'Tu médico está revisando los resultados.' },
  VALIDATED:     { label: 'Validado',           description: 'Los resultados fueron incorporados a tu historial.' },
  REJECTED:      { label: 'Rechazado',          description: 'Contacta a tu médico para más información.' },
}

export const RESULT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  NORMAL:       { label: 'Normal',     color: '#059669' },
  HIGH:         { label: 'Alto',       color: '#d97706' },
  LOW:          { label: 'Bajo',       color: '#2563eb' },
  CRITICAL_HIGH:{ label: 'Crítico ↑', color: '#dc2626' },
  CRITICAL_LOW: { label: 'Crítico ↓', color: '#7c3aed' },
  PENDING:      { label: 'Pendiente', color: '#94a3b8' },
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getPortalLabOrders(token: string): Promise<PatientLabOrder[]> {
  return portalFetch('/portal/lab/orders', token)
}

export async function getPatientExternalSubmissions(token: string): Promise<PatientExternalSubmission[]> {
  return portalFetch('/portal/lab/external-submissions', token)
}

export async function getPortalLabOrder(token: string, orderId: string): Promise<PatientLabOrderFull> {
  return portalFetch(`/portal/lab/orders/${orderId}`, token)
}

export async function submitExternalLabResults(
  token: string,
  files: File[],
  meta: { order_id?: string; patient_notes?: string },
): Promise<PatientExternalSubmission> {
  const formData = new FormData()
  for (const file of files) {
    formData.append('file', file)
  }
  formData.append('meta', JSON.stringify(meta))

  const res = await fetch(`${API}/portal/lab/submit-external`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
    body:    formData,
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Upload failed')
  return json.data as PatientExternalSubmission
}
