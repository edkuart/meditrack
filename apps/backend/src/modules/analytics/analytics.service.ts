import { fetchClinicSummary, fetchPatientDosesByDay } from './analytics.repository.ts'
import type { ClinicSummary, DayAdherence, PatientAdherenceReport } from './analytics.types.ts'

const SKIP_STATUSES = new Set(['CANCELLED', 'SUPERSEDED'])

export async function getClinicSummary(tenantId: string): Promise<ClinicSummary> {
  return fetchClinicSummary(tenantId)
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
