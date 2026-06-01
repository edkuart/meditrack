import { eq, and, gte, lte, desc, asc } from 'drizzle-orm'
import { db, appointments, patients } from '../../shared/db/index.ts'
import { NotFoundError } from '../../shared/errors.ts'
import type { z } from 'zod'
import type {
  CreateAppointmentSchema,
  UpdateAppointmentSchema,
  ListAppointmentsSchema,
} from './appointments.schema.ts'

// ─── Shared query with relations ──────────────────────────────────────────────

const WITH_RELATIONS = {
  patient: {
    columns: { first_name: true, last_name: true, date_of_birth: true, sex: true },
  },
  doctor: {
    columns: { first_name: true, last_name: true, specialty: true },
  },
  location: {
    columns: { name: true, address: true },
  },
} as const

// ─── List appointments for the clinic ─────────────────────────────────────────

export async function listAppointments(
  tenantId: string,
  params: z.infer<typeof ListAppointmentsSchema>,
) {
  const { from, to, doctor_id, patient_id, status, limit } = params

  const rows = await db.query.appointments.findMany({
    where: (a, { and: _and, eq: _eq, gte: _gte, lte: _lte }) => {
      const conds = [_eq(a.tenant_id, tenantId)]
      if (from)      conds.push(_gte(a.scheduled_at, new Date(from + 'T00:00:00Z')))
      if (to)        conds.push(_lte(a.scheduled_at, new Date(to   + 'T23:59:59Z')))
      if (doctor_id) conds.push(_eq(a.doctor_id, doctor_id))
      if (patient_id)conds.push(_eq(a.patient_id, patient_id))
      if (status)    conds.push(_eq(a.status, status))
      return _and(...conds)
    },
    with: WITH_RELATIONS,
    orderBy: (a, { asc: _asc }) => _asc(a.scheduled_at),
    limit,
  })

  return rows
}

// ─── Per-patient appointments ─────────────────────────────────────────────────

export async function listPatientAppointments(tenantId: string, patientId: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.id, patientId), eq(patients.tenant_id, tenantId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  return db.query.appointments.findMany({
    where: and(eq(appointments.patient_id, patientId), eq(appointments.tenant_id, tenantId)),
    with: WITH_RELATIONS,
    orderBy: desc(appointments.scheduled_at),
    limit: 50,
  })
}

// ─── Single appointment ───────────────────────────────────────────────────────

export async function getAppointment(tenantId: string, id: string) {
  const row = await db.query.appointments.findFirst({
    where: and(eq(appointments.id, id), eq(appointments.tenant_id, tenantId)),
    with: WITH_RELATIONS,
  })
  if (!row) throw new NotFoundError('Appointment')
  return row
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createAppointment(
  tenantId: string,
  createdBy: string,
  body: z.infer<typeof CreateAppointmentSchema>,
) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.id, body.patient_id), eq(patients.tenant_id, tenantId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  const [row] = await db.insert(appointments).values({
    tenant_id:        tenantId,
    created_by:       createdBy,
    patient_id:       body.patient_id,
    doctor_id:        body.doctor_id,
    location_id:      body.location_id ?? null,
    scheduled_at:     new Date(body.scheduled_at),
    duration_minutes: body.duration_minutes ?? 30,
    type:             body.type ?? 'CONSULTATION',
    status:           'SCHEDULED',
    reason:           body.reason ?? null,
    notes:            body.notes ?? null,
  }).returning()

  return getAppointment(tenantId, row!.id)
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateAppointment(
  tenantId: string,
  id: string,
  body: z.infer<typeof UpdateAppointmentSchema>,
) {
  const existing = await db.query.appointments.findFirst({
    where: and(eq(appointments.id, id), eq(appointments.tenant_id, tenantId)),
    columns: { id: true, status: true },
  })
  if (!existing) throw new NotFoundError('Appointment')

  const patch: Partial<typeof appointments.$inferInsert> = { updated_at: new Date() }
  if (body.scheduled_at !== undefined)     patch.scheduled_at     = new Date(body.scheduled_at)
  if (body.duration_minutes !== undefined) patch.duration_minutes = body.duration_minutes
  if (body.type !== undefined)             patch.type             = body.type
  if (body.reason !== undefined)           patch.reason           = body.reason
  if (body.notes !== undefined)            patch.notes            = body.notes
  if (body.location_id !== undefined)      patch.location_id      = body.location_id

  await db.update(appointments).set(patch).where(and(eq(appointments.id, id), eq(appointments.tenant_id, tenantId)))
  return getAppointment(tenantId, id)
}

// ─── Status transitions ───────────────────────────────────────────────────────

async function setStatus(
  tenantId: string,
  id: string,
  status: typeof appointments.$inferSelect['status'],
  extra?: Partial<typeof appointments.$inferInsert>,
) {
  const existing = await db.query.appointments.findFirst({
    where: and(eq(appointments.id, id), eq(appointments.tenant_id, tenantId)),
    columns: { id: true },
  })
  if (!existing) throw new NotFoundError('Appointment')

  await db.update(appointments)
    .set({ status, updated_at: new Date(), ...(extra ?? {}) })
    .where(and(eq(appointments.id, id), eq(appointments.tenant_id, tenantId)))

  return getAppointment(tenantId, id)
}

export const confirmAppointment  = (tenantId: string, id: string) => setStatus(tenantId, id, 'CONFIRMED')
export const waitingAppointment  = (tenantId: string, id: string) => setStatus(tenantId, id, 'WAITING')
export const startAppointment    = (tenantId: string, id: string) => setStatus(tenantId, id, 'IN_PROGRESS')
export const completeAppointment = (tenantId: string, id: string) => setStatus(tenantId, id, 'COMPLETED')
export const noShowAppointment   = (tenantId: string, id: string) => setStatus(tenantId, id, 'NO_SHOW')

export async function cancelAppointment(tenantId: string, id: string, reason?: string) {
  return setStatus(tenantId, id, 'CANCELLED', { cancelled_reason: reason ?? null })
}
