const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

async function clinicalIntelligenceFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
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

export type AiUsageFeature =
  | 'ENCOUNTER_SUMMARY'
  | 'PATIENT_SIMPLIFICATION'
  | 'CLINICAL_COPILOT'
  | 'DOCUMENT_EXTRACTION'
  | 'TRANSCRIPTION'
  | 'OTHER'

export interface AiUsageStatus {
  plan: 'free' | 'pro' | 'enterprise'
  period: { starts_at: string }
  limit: number
  used: number
  remaining: number
  event_count: number
}

export interface AiUsageEvent {
  id: string
  patient_id: string | null
  encounter_id: string | null
  feature: AiUsageFeature
  provider: string
  model: string
  units: number
  input_tokens: number | null
  output_tokens: number | null
  estimated_cost_cents: number
  resource_type: string | null
  resource_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type ClinicalReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED'
export type ClinicalReviewPriority = 'LOW' | 'NORMAL' | 'HIGH'

export interface ClinicalReviewItem {
  id: string
  patient_id: string
  encounter_id: string | null
  document_id: string | null
  item_type: string
  status: ClinicalReviewStatus
  priority: ClinicalReviewPriority
  title: string
  summary: string | null
  confidence: number | null
  reasoning: string | null
  created_at: string
  patient?: {
    id: string
    first_name: string
    last_name: string
    date_of_birth: string | null
    sex: string | null
  }
  document?: {
    id: string
    file_name: string
    type: string
    mime_type: string
    created_at: string
  } | null
  encounter?: {
    id: string
    encounter_type: string
    opened_at: string
  } | null
  provenance?: {
    id: string
    source_type: string
    source_label: string | null
    source_excerpt: string | null
    confidence: number | null
    created_at: string
  } | null
}

export interface PatientClinicalSummary {
  patient: {
    id: string
    first_name: string
    last_name: string
    date_of_birth: string | null
    sex: string | null
    phone: string | null
    email: string | null
    notes: string | null
  }
  problems: Array<{
    id: string
    problem_number: number
    title: string
    description: string | null
    status: string
    icd10_code: string | null
  }>
  background: Array<{
    id: string
    category: string
    content: string
  }>
  latest_encounters: Array<{
    id: string
    encounter_type: string
    status: string
    chief_complaint: string | null
    summary: string | null
    opened_at: string
  }>
  latest_vitals: unknown[]
  latest_labs: unknown[]
  latest_documents: Array<{
    id: string
    file_name: string
    type: string
    mime_type: string
    created_at: string
  }>
  latest_transcripts: unknown[]
  treatments: unknown[]
  pending_review_items: ClinicalReviewItem[]
}

export type ClinicalCopilotMode =
  | 'ASK_CLINICAL_QUESTION'
  | 'PREPARE_CONSULTATION'
  | 'SUGGEST_PATIENT_QUESTIONS'
  | 'DRAFT_SOAP'
  | 'REVIEW_CLINICAL_GAPS'

export type ClinicalCopilotModelTier = 'standard' | 'premium'

export interface ClinicalCopilotResponse {
  mode: ClinicalCopilotMode
  model: string
  provider?: string
  model_tier?: ClinicalCopilotModelTier
  safety_notice: string
  summary: string
  answer?: string
  suggested_questions: string[]
  clinical_gaps: string[]
  soft_alerts: string[]
  soap_draft?: {
    subjective: string
    objective: string
    assessment: string
    plan: string
  }
  evidence: Array<{ label: string; value: string }>
  review_item?: unknown
}

export async function getAiUsageStatus(token: string): Promise<AiUsageStatus> {
  return clinicalIntelligenceFetch('/ai-usage/status', token)
}

export async function listAiUsageEvents(token: string, limit = 25, patientId?: string): Promise<AiUsageEvent[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (patientId) params.set('patient_id', patientId)
  return clinicalIntelligenceFetch(`/ai-usage/events?${params.toString()}`, token)
}

export async function listClinicalReviewItems(
  token: string,
  status: ClinicalReviewStatus = 'PENDING',
  limit = 25,
): Promise<ClinicalReviewItem[]> {
  const params = new URLSearchParams({ status, limit: String(limit) })
  return clinicalIntelligenceFetch(`/clinical/review-items?${params.toString()}`, token)
}

export async function resolveClinicalReviewItem(
  token: string,
  id: string,
  status: Exclude<ClinicalReviewStatus, 'PENDING'>,
  reviewer_notes?: string,
): Promise<ClinicalReviewItem> {
  return clinicalIntelligenceFetch(`/clinical/review-items/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ status, reviewer_notes }),
  })
}

export async function getPatientClinicalSummary(
  token: string,
  patientId: string,
): Promise<PatientClinicalSummary> {
  return clinicalIntelligenceFetch(`/patients/${patientId}/clinical/summary`, token)
}

export async function runPatientClinicalCopilot(
  token: string,
  patientId: string,
  input: {
    mode: ClinicalCopilotMode
    model_tier?: ClinicalCopilotModelTier
    question?: string
    source_text?: string
    save_to_review_queue?: boolean
  },
): Promise<ClinicalCopilotResponse> {
  return clinicalIntelligenceFetch(`/patients/${patientId}/clinical-copilot`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
