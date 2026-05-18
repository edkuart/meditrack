const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'

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
  new_patients_no_encounter: number
  today_doses_total: number
  today_doses_confirmed: number
  today_doses_missed: number
  today_doses_pending: number
  active_admissions: number
  pending_incoming_referrals: number
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

// ─── Priority alert drill-downs ──────────────────────────────────────────────

export interface AlertPatient {
  id: string
  first_name: string
  last_name: string
  dose_count?: number
  active_treatments?: number
  created_at?: string
}

export interface DoseAlertData {
  status: 'PENDING' | 'MISSED'
  date: string
  patients: AlertPatient[]
}

export interface NewPatientsAlertData {
  month: string
  patients: AlertPatient[]
}

export interface ActiveTreatmentsAlertData {
  patients: AlertPatient[]
}

export async function getPendingDosesAlert(token: string): Promise<DoseAlertData> {
  return apiFetch('/analytics/clinic/alerts/pending-doses', token)
}

export async function getMissedDosesAlert(token: string): Promise<DoseAlertData> {
  return apiFetch('/analytics/clinic/alerts/missed-doses', token)
}

export async function getNewPatientsAlert(token: string): Promise<NewPatientsAlertData> {
  return apiFetch('/analytics/clinic/alerts/new-patients', token)
}

export async function getActiveTreatmentsAlert(token: string): Promise<ActiveTreatmentsAlertData> {
  return apiFetch('/analytics/clinic/alerts/active-treatments', token)
}

// ─── CSV export ───────────────────────────────────────────────────────────────

export function buildCsvExportUrl(): string {
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api/v1'
  return `${API}/analytics/export/patients`
}
