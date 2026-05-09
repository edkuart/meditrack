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
  date: string        // YYYY-MM-DD
  confirmed: number
  total: number       // non-cancelled, non-superseded
  score: number       // 0-100, or -1 if no doses scheduled
}

export interface PatientAdherenceReport {
  patient_id: string
  period_days: number
  overall_score: number
  confirmed: number
  missed: number
  total: number
  days: DayAdherence[]
  streak: number      // consecutive days (backwards from today) with score >= 80
}

// ─── Clinic trends ────────────────────────────────────────────────────────────

export interface WeeklyTrend {
  week_start: string  // YYYY-MM-DD (Monday)
  new_patients: number
  encounters_opened: number
  doses_confirmed: number
  doses_total: number
  adherence_rate: number  // 0-100, or -1 if no doses
}

export interface ClinicTrends {
  weeks: WeeklyTrend[]
}

// ─── Adherence cohorts ────────────────────────────────────────────────────────

export type CohortBucket = 'high' | 'medium' | 'low' | 'no_data'

export interface CohortPatient {
  id: string
  first_name: string
  last_name: string
  overall_score: number
  active_treatments: number
}

export interface AdherenceCohorts {
  period_days: number
  high: CohortPatient[]    // score >= 80
  medium: CohortPatient[]  // 50 <= score < 80
  low: CohortPatient[]     // score < 50 (and has doses)
  no_data: CohortPatient[] // no doses in period
}
