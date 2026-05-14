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

export async function getAiUsageStatus(token: string): Promise<AiUsageStatus> {
  return clinicalIntelligenceFetch('/ai-usage/status', token)
}

export async function listAiUsageEvents(token: string, limit = 25): Promise<AiUsageEvent[]> {
  return clinicalIntelligenceFetch(`/ai-usage/events?limit=${limit}`, token)
}
