import { and, count, eq, gte, lt, sql } from 'drizzle-orm'
import { db, patients, treatmentPlans, doseEvents } from '../../shared/db/index.ts'
import type { ClinicSummary } from './analytics.types.ts'

// ─── Clinic summary ───────────────────────────────────────────────────────────

export async function fetchClinicSummary(tenantId: string): Promise<ClinicSummary> {
  const [patientStats] = await db
    .select({
      total: count(patients.id),
      active: sql<number>`count(*) filter (where ${patients.is_active} = true)`,
      this_month: sql<number>`count(*) filter (where ${patients.created_at} >= date_trunc('month', now()))`,
    })
    .from(patients)
    .where(eq(patients.tenant_id, tenantId))

  const [treatmentStats] = await db
    .select({ active: count(treatmentPlans.id) })
    .from(treatmentPlans)
    .innerJoin(patients, eq(treatmentPlans.patient_id, patients.id))
    .where(and(
      eq(patients.tenant_id, tenantId),
      eq(treatmentPlans.status, 'ACTIVE'),
    ))

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)

  const todayRows = await db
    .select({
      status: doseEvents.status,
      cnt: count(doseEvents.id),
    })
    .from(doseEvents)
    .innerJoin(patients, eq(doseEvents.patient_id, patients.id))
    .where(and(
      eq(patients.tenant_id, tenantId),
      gte(doseEvents.scheduled_at, today),
      lt(doseEvents.scheduled_at, tomorrow),
    ))
    .groupBy(doseEvents.status)

  const todayMap: Record<string, number> = {}
  for (const row of todayRows) todayMap[row.status] = Number(row.cnt)

  const todayTotal = Object.values(todayMap).reduce((a, b) => a + b, 0)

  return {
    total_patients: Number(patientStats.total),
    active_patients: Number(patientStats.active),
    active_treatments: Number(treatmentStats.active),
    monthly_new_patients: Number(patientStats.this_month),
    today_doses_total: todayTotal,
    today_doses_confirmed: todayMap['CONFIRMED'] ?? 0,
    today_doses_missed: todayMap['MISSED'] ?? 0,
    today_doses_pending: todayMap['PENDING'] ?? 0,
  }
}

// ─── Per-patient adherence data ───────────────────────────────────────────────

export interface RawDoseRow {
  date: string
  status: string
  cnt: number
}

export async function fetchPatientDosesByDay(
  patientId: string,
  since: Date,
): Promise<RawDoseRow[]> {
  const rows = await db
    .select({
      date: sql<string>`DATE(${doseEvents.scheduled_at})::text`,
      status: doseEvents.status,
      cnt: count(doseEvents.id),
    })
    .from(doseEvents)
    .where(and(
      eq(doseEvents.patient_id, patientId),
      gte(doseEvents.scheduled_at, since),
    ))
    .groupBy(sql`DATE(${doseEvents.scheduled_at})`, doseEvents.status)

  return rows.map(r => ({ date: r.date, status: r.status, cnt: Number(r.cnt) }))
}
