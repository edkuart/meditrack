const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

async function apiFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
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

// ─── Consents ─────────────────────────────────────────────────────────────────

export type ConsentType = 'data_processing' | 'treatment' | 'third_party_sharing' | 'research' | 'marketing'

export interface PatientConsent {
  id: string
  patient_id: string
  consent_type: ConsentType
  description: string | null
  recorded_by: string | null
  recorded_by_email: string | null
  consented_at: string
  withdrawn_at: string | null
  withdrawn_by: string | null
  notes: string | null
  created_at: string
}

export async function getPatientConsents(token: string, patientId: string): Promise<PatientConsent[]> {
  return apiFetch(`/compliance/patients/${patientId}/consents`, token)
}

export async function recordConsent(
  token: string,
  patientId: string,
  input: {
    consent_type: ConsentType
    description?: string
    consented_at: string
    notes?: string
  },
): Promise<PatientConsent> {
  return apiFetch(`/compliance/patients/${patientId}/consents`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function withdrawConsent(token: string, patientId: string, consentId: string): Promise<void> {
  await apiFetch(`/compliance/patients/${patientId}/consents/${consentId}`, token, { method: 'DELETE' })
}

// ─── Data export ──────────────────────────────────────────────────────────────

export interface PatientDataExport {
  exported_at: string
  patient: {
    id: string
    first_name: string
    last_name: string
    date_of_birth: string | null
    sex: string | null
    phone: string | null
    email: string | null
    id_number: string | null
    created_at: string
    anonymized_at: string | null
  }
  encounters: unknown[]
  treatments: unknown[]
  consents: PatientConsent[]
}

export async function exportPatientData(token: string, patientId: string): Promise<PatientDataExport> {
  return apiFetch(`/compliance/patients/${patientId}/export`, token)
}

// ─── Anonymization ────────────────────────────────────────────────────────────

export interface AnonymizeResult {
  already_anonymized: boolean
  anonymized_at: string
}

export async function anonymizePatient(token: string, patientId: string): Promise<AnonymizeResult> {
  return apiFetch(`/compliance/patients/${patientId}/pii`, token, { method: 'DELETE' })
}

// ─── Legal acceptance ─────────────────────────────────────────────────────────

export interface LegalStatus {
  tos_accepted_at: string | null
  privacy_policy_accepted_at: string | null
}

export async function getLegalStatus(token: string): Promise<LegalStatus> {
  return apiFetch('/compliance/legal/status', token)
}

export async function acceptLegal(token: string, type: 'tos' | 'privacy'): Promise<{ accepted_at: string }> {
  return apiFetch('/compliance/legal/accept', token, {
    method: 'POST',
    body: JSON.stringify({ type }),
  })
}
