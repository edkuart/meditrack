import {
  fetchClinicSummary, fetchPatientDosesByDay,
  fetchWeeklyTrends, fetchAdherenceCohortData, fetchPatientsCsvData,
  fetchPatientsWithDosesToday, fetchNewPatientsWithoutEncounter, fetchPatientsWithActiveTreatments,
} from './analytics.repository.ts'
import type {
  ClinicSummary, DayAdherence, PatientAdherenceReport,
  ClinicTrends, AdherenceCohorts, CohortPatient,
  DoseAlertData, NewPatientsAlertData, ActiveTreatmentsAlertData,
} from './analytics.types.ts'

const SKIP_STATUSES = new Set(['CANCELLED', 'SUPERSEDED'])

export async function getClinicSummary(tenantId: string, doctorId: string): Promise<ClinicSummary> {
  return fetchClinicSummary(tenantId, doctorId)
}

export async function getPatientAdherenceReport(
  patientId: string,
  periodDays: number,
): Promise<PatientAdherenceReport> {
  const since = new Date()
  since.setDate(since.getDate() - periodDays)
  since.setHours(0, 0, 0, 0)

  const rawRows = await fetchPatientDosesByDay(patientId, since)

  // Group raw rows by date and status
  const byDate: Record<string, Record<string, number>> = {}
  for (const row of rawRows) {
    byDate[row.date] ??= {}
    byDate[row.date][row.status] = (byDate[row.date][row.status] ?? 0) + row.cnt
  }

  const days = buildDayAdherence(byDate, periodDays)

  const totalConfirmed = days.reduce((s, d) => s + d.confirmed, 0)
  const totalRelevant = days.reduce((s, d) => s + d.total, 0)
  const overallScore = totalRelevant > 0
    ? Math.round((totalConfirmed / totalRelevant) * 100)
    : 100

  return {
    patient_id: patientId,
    period_days: periodDays,
    overall_score: overallScore,
    confirmed: totalConfirmed,
    missed: totalRelevant - totalConfirmed,
    total: totalRelevant,
    days,
    streak: calcStreak(days),
  }
}

// ─── Pure helpers (exported for unit testing) ─────────────────────────────────

export function buildDayAdherence(
  byDate: Record<string, Record<string, number>>,
  periodDays: number,
): DayAdherence[] {
  const days: DayAdherence[] = []

  for (let i = periodDays - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const dayData = byDate[dateStr] ?? {}

    const confirmed = dayData['CONFIRMED'] ?? 0
    const relevant = Object.entries(dayData)
      .filter(([s]) => !SKIP_STATUSES.has(s))
      .reduce((sum, [, n]) => sum + n, 0)

    days.push({
      date: dateStr,
      confirmed,
      total: relevant,
      score: relevant > 0 ? Math.round((confirmed / relevant) * 100) : -1,
    })
  }

  return days
}

export function calcStreak(days: DayAdherence[]): number {
  let streak = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]
    if (d.score === -1) break   // no doses — streak broken
    if (d.score >= 80) streak++
    else break
  }
  return streak
}

// ─── Clinic trends ────────────────────────────────────────────────────────────

export async function getClinicTrends(tenantId: string, weeks = 12): Promise<ClinicTrends> {
  const clampedWeeks = Math.min(52, Math.max(4, weeks))
  const weekData = await fetchWeeklyTrends(tenantId, clampedWeeks)
  return { weeks: weekData }
}

// ─── Adherence cohorts ────────────────────────────────────────────────────────

export async function getAdherenceCohorts(tenantId: string, periodDays = 30): Promise<AdherenceCohorts> {
  const rows = await fetchAdherenceCohortData(tenantId, periodDays)

  const high: CohortPatient[] = []
  const medium: CohortPatient[] = []
  const low: CohortPatient[] = []
  const no_data: CohortPatient[] = []

  for (const r of rows) {
    const score = r.total > 0 ? Math.round((r.confirmed / r.total) * 100) : -1
    const patient: CohortPatient = {
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      overall_score: score,
      active_treatments: r.active_treatments,
    }
    if (score === -1) no_data.push(patient)
    else if (score >= 80) high.push(patient)
    else if (score >= 50) medium.push(patient)
    else low.push(patient)
  }

  // Sort each bucket by score descending (no_data alphabetically)
  high.sort((a, b) => b.overall_score - a.overall_score)
  medium.sort((a, b) => b.overall_score - a.overall_score)
  low.sort((a, b) => a.overall_score - b.overall_score)
  no_data.sort((a, b) => a.last_name.localeCompare(b.last_name))

  return { period_days: periodDays, high, medium, low, no_data }
}

// ─── Priority alert drill-downs ───────────────────────────────────────────────

export async function getDoseAlert(
  tenantId: string,
  status: 'PENDING' | 'MISSED',
): Promise<DoseAlertData> {
  const patients = await fetchPatientsWithDosesToday(tenantId, status)
  return {
    status,
    date: new Date().toISOString().slice(0, 10),
    patients,
  }
}

export async function getNewPatientsAlert(tenantId: string): Promise<NewPatientsAlertData> {
  const patients = await fetchNewPatientsWithoutEncounter(tenantId)
  return {
    month: new Date().toISOString().slice(0, 7),
    patients,
  }
}

export async function getActiveTreatmentsAlert(tenantId: string): Promise<ActiveTreatmentsAlertData> {
  const patients = await fetchPatientsWithActiveTreatments(tenantId)
  return { patients }
}

// ─── CSV export ───────────────────────────────────────────────────────────────

export async function buildPatientsCsv(tenantId: string): Promise<string> {
  const rows = await fetchPatientsCsvData(tenantId)

  const headers = [
    'ID', 'Apellido', 'Nombre', 'Fecha nacimiento', 'Sexo',
    'Email', 'Teléfono', 'Nº documento', 'Activo', 'Tratamientos activos', 'Registrado',
  ]

  const escape = (v: string | number | boolean | null | undefined): string => {
    if (v == null) return ''
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }

  const csvRows = [
    headers.join(','),
    ...rows.map(r => [
      r.id, r.last_name, r.first_name, r.date_of_birth ?? '',
      r.sex ?? '', r.email ?? '', r.phone ?? '', r.id_number ?? '',
      r.is_active ? 'Sí' : 'No', r.active_treatments,
      r.created_at.substring(0, 10),
    ].map(escape).join(',')),
  ]

  return csvRows.join('\r\n')
}
