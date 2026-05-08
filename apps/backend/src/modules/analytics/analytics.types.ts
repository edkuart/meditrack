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
