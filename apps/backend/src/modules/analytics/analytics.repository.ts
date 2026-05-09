import { and, count, eq, gte, lt, sql } from 'drizzle-orm'
import { db, patients, treatmentPlans, doseEvents, encounters } from '../../shared/db/index.ts'
import type { ClinicSummary, WeeklyTrend } from './analytics.types.ts'

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
    .where(and(
      eq(treatmentPlans.tenant_id, tenantId),
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

// ─── Weekly clinic trends ─────────────────────────────────────────────────────

export async function fetchWeeklyTrends(tenantId: string, weeks: number): Promise<WeeklyTrend[]> {
  const since = new Date()
  since.setDate(since.getDate() - weeks * 7)
  since.setHours(0, 0, 0, 0)

  const [newPatientRows, encounterRows, doseRows] = await Promise.all([
    // New patients per week
    db.select({
      week: sql<string>`DATE_TRUNC('week', ${patients.created_at})::date::text`,
      cnt: count(patients.id),
    })
      .from(patients)
      .where(and(eq(patients.tenant_id, tenantId), gte(patients.created_at, since)))
      .groupBy(sql`DATE_TRUNC('week', ${patients.created_at})`),

    // Encounters opened per week
    db.select({
      week: sql<string>`DATE_TRUNC('week', ${encounters.opened_at})::date::text`,
      cnt: count(encounters.id),
    })
      .from(encounters)
      .where(and(eq(encounters.tenant_id, tenantId), gte(encounters.opened_at, since)))
      .groupBy(sql`DATE_TRUNC('week', ${encounters.opened_at})`),

    // Dose events per week by status
    db.select({
      week: sql<string>`DATE_TRUNC('week', ${doseEvents.scheduled_at})::date::text`,
      status: doseEvents.status,
      cnt: count(doseEvents.id),
    })
      .from(doseEvents)
      .innerJoin(patients, eq(doseEvents.patient_id, patients.id))
      .where(and(eq(patients.tenant_id, tenantId), gte(doseEvents.scheduled_at, since)))
      .groupBy(sql`DATE_TRUNC('week', ${doseEvents.scheduled_at})`, doseEvents.status),
  ])

  // Build a map keyed by week start (Monday)
  const weekMap: Map<string, WeeklyTrend> = new Map()

  function ensureWeek(weekStr: string): WeeklyTrend {
    if (!weekMap.has(weekStr)) {
      weekMap.set(weekStr, {
        week_start: weekStr,
        new_patients: 0,
        encounters_opened: 0,
        doses_confirmed: 0,
        doses_total: 0,
        adherence_rate: -1,
      })
    }
    return weekMap.get(weekStr)!
  }

  for (const r of newPatientRows) ensureWeek(r.week).new_patients = Number(r.cnt)
  for (const r of encounterRows) ensureWeek(r.week).encounters_opened = Number(r.cnt)

  const SKIP = new Set(['CANCELLED', 'SUPERSEDED'])
  for (const r of doseRows) {
    const w = ensureWeek(r.week)
    const cnt = Number(r.cnt)
    if (!SKIP.has(r.status)) w.doses_total += cnt
    if (r.status === 'CONFIRMED') w.doses_confirmed += cnt
  }

  for (const w of weekMap.values()) {
    w.adherence_rate = w.doses_total > 0
      ? Math.round((w.doses_confirmed / w.doses_total) * 100)
      : -1
  }

  return [...weekMap.values()].sort((a, b) => a.week_start.localeCompare(b.week_start))
}

// ─── Adherence cohorts ────────────────────────────────────────────────────────

export interface CohortRow {
  id: string
  first_name: string
  last_name: string
  confirmed: number
  total: number     // non-cancelled, non-superseded
  active_treatments: number
}

export async function fetchAdherenceCohortData(
  tenantId: string,
  periodDays: number,
): Promise<CohortRow[]> {
  const since = new Date()
  since.setDate(since.getDate() - periodDays)
  since.setHours(0, 0, 0, 0)

  const rows = await db.select({
    id: patients.id,
    first_name: patients.first_name,
    last_name: patients.last_name,
    confirmed: sql<number>`COALESCE(SUM(CASE WHEN ${doseEvents.status} = 'CONFIRMED' THEN 1 ELSE 0 END), 0)`,
    total: sql<number>`COALESCE(SUM(CASE WHEN ${doseEvents.status} NOT IN ('CANCELLED','SUPERSEDED') THEN 1 ELSE 0 END), 0)`,
    active_treatments: sql<number>`(
      SELECT COUNT(*) FROM treatment_plans
      WHERE patient_id = ${patients.id}
        AND status = 'ACTIVE'
    )`,
  })
    .from(patients)
    .leftJoin(doseEvents, and(
      eq(doseEvents.patient_id, patients.id),
      gte(doseEvents.scheduled_at, since),
    ))
    .where(and(eq(patients.tenant_id, tenantId), eq(patients.is_active, true)))
    .groupBy(patients.id, patients.first_name, patients.last_name)

  return rows.map(r => ({
    id: r.id,
    first_name: r.first_name,
    last_name: r.last_name,
    confirmed: Number(r.confirmed),
    total: Number(r.total),
    active_treatments: Number(r.active_treatments),
  }))
}

// ─── Patient CSV export data ──────────────────────────────────────────────────

export interface PatientCsvRow {
  id: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  sex: string | null
  email: string | null
  phone: string | null
  id_number: string | null
  is_active: boolean
  created_at: string
  active_treatments: number
}

export async function fetchPatientsCsvData(tenantId: string): Promise<PatientCsvRow[]> {
  const rows = await db.select({
    id: patients.id,
    first_name: patients.first_name,
    last_name: patients.last_name,
    date_of_birth: patients.date_of_birth,
    sex: patients.sex,
    email: patients.email,
    phone: patients.phone,
    id_number: patients.id_number,
    is_active: patients.is_active,
    created_at: patients.created_at,
    active_treatments: sql<number>`(
      SELECT COUNT(*) FROM treatment_plans
      WHERE patient_id = ${patients.id}
        AND status = 'ACTIVE'
    )`,
  })
    .from(patients)
    .where(eq(patients.tenant_id, tenantId))
    .orderBy(patients.last_name, patients.first_name)

  return rows.map(r => ({
    ...r,
    date_of_birth: r.date_of_birth,
    sex: r.sex,
    created_at: r.created_at.toISOString(),
    active_treatments: Number(r.active_treatments),
  }))
}
