const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

async function apiFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error?.message ?? 'Request failed')
  return json.data as T
}

export interface ClinicSummary {
  total_patients: number
  active_patients: number
  active_treatments: number
  monthly_new_patients: number
  today_doses_total: number
  today_doses_confirmed: number
  today_doses_missed: number
  today_doses_pending: number
}

export interface DayAdherence {
  date: string
  confirmed: number
  total: number
  score: number   // 0-100, or -1 if no doses
}

export interface PatientAdherenceReport {
  patient_id: string
  period_days: number
  overall_score: number
  confirmed: number
  missed: number
  total: number
  days: DayAdherence[]
  streak: number
}

export async function getClinicSummary(token: string): Promise<ClinicSummary> {
  return apiFetch('/analytics/clinic', token)
}

export async function getPatientAdherence(
  token: string,
  patientId: string,
  period = 30,
): Promise<PatientAdherenceReport> {
  return apiFetch(`/analytics/patients/${patientId}/adherence?period=${period}`, token)
}

// ─── Clinic trends ────────────────────────────────────────────────────────────

export interface WeeklyTrend {
  week_start: string
  new_patients: number
  encounters_opened: number
  doses_confirmed: number
  doses_total: number
  adherence_rate: number  // 0-100, or -1 if no doses
}

export interface ClinicTrends {
  weeks: WeeklyTrend[]
}

export async function getClinicTrends(token: string, weeks = 12): Promise<ClinicTrends> {
  return apiFetch(`/analytics/clinic/trends?weeks=${weeks}`, token)
}

// ─── Adherence cohorts ────────────────────────────────────────────────────────

export interface CohortPatient {
  id: string
  first_name: string
  last_name: string
  overall_score: number
  active_treatments: number
}

export interface AdherenceCohorts {
  period_days: number
  high: CohortPatient[]
  medium: CohortPatient[]
  low: CohortPatient[]
  no_data: CohortPatient[]
}

export async function getAdherenceCohorts(token: string, period = 30): Promise<AdherenceCohorts> {
  return apiFetch(`/analytics/clinic/cohorts?period=${period}`, token)
}

// ─── CSV export ───────────────────────────────────────────────────────────────

export function buildCsvExportUrl(): string {
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'
  return `${API}/analytics/export/patients`
}
