import { eq, and, or, desc } from 'drizzle-orm'
import { db, referrals, patients, users, departments } from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { sendDoctorEventEmail } from '../notifications/notifications.service.ts'
import { NotFoundError, ForbiddenError } from '../../shared/errors.ts'
import type { CreateReferralInput, RespondReferralInput } from './referrals.schema.ts'

const APP_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getDoctorContact(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, first_name: true, last_name: true, email: true },
  })
}

// ─── Create ────────────────────────────────────────────────────────────────────

export async function createReferral(
  tenantId: string,
  fromDoctorId: string,
  fromDoctorEmail: string,
  patientId: string,
  input: CreateReferralInput,
) {
  // Validate patient belongs to tenant
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  // Validate receiving doctor/department exists in tenant
  if (input.to_doctor_id) {
    const toDoctor = await db.query.users.findFirst({
      where: and(eq(users.tenant_id, tenantId), eq(users.id, input.to_doctor_id)),
      columns: { id: true },
    })
    if (!toDoctor) throw new NotFoundError('Receiving doctor')
  }

  if (input.to_department_id) {
    const toDept = await db.query.departments.findFirst({
      where: and(eq(departments.tenant_id, tenantId), eq(departments.id, input.to_department_id)),
      columns: { id: true },
    })
    if (!toDept) throw new NotFoundError('Department')
  }

  const [referral] = await db
    .insert(referrals)
    .values({
      tenant_id: tenantId,
      patient_id: patientId,
      from_doctor_id: fromDoctorId,
      to_doctor_id: input.to_doctor_id ?? null,
      to_department_id: input.to_department_id ?? null,
      encounter_id: input.encounter_id ?? null,
      reason: input.reason,
      notes: input.notes ?? null,
      priority: input.priority,
    })
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: fromDoctorId,
    actor_type: 'USER',
    actor_email: fromDoctorEmail,
    action: 'REFERRAL_CREATED',
    resource_type: 'REFERRAL',
    resource_id: referral.id,
    context: {
      patient_id: patientId,
      to_doctor_id: input.to_doctor_id,
      to_department_id: input.to_department_id,
      priority: input.priority,
    },
  })

  return referral
}

// ─── List for patient ─────────────────────────────────────────────────────────

export async function listPatientReferrals(tenantId: string, patientId: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  return db.query.referrals.findMany({
    where: and(eq(referrals.tenant_id, tenantId), eq(referrals.patient_id, patientId)),
    with: {
      from_doctor: { columns: { id: true, first_name: true, last_name: true, specialty: true } },
      to_doctor: { columns: { id: true, first_name: true, last_name: true, specialty: true } },
      to_department: { columns: { id: true, name: true, type: true } },
    },
    orderBy: desc(referrals.created_at),
  })
}

// ─── Inbox (doctor's own referrals) ──────────────────────────────────────────

export async function listDoctorReferrals(
  tenantId: string,
  doctorId: string,
  direction: 'incoming' | 'outgoing' | 'all',
) {
  const where = direction === 'incoming'
    ? and(eq(referrals.tenant_id, tenantId), eq(referrals.to_doctor_id, doctorId))
    : direction === 'outgoing'
    ? and(eq(referrals.tenant_id, tenantId), eq(referrals.from_doctor_id, doctorId))
    : and(
        eq(referrals.tenant_id, tenantId),
        or(eq(referrals.from_doctor_id, doctorId), eq(referrals.to_doctor_id, doctorId)),
      )

  return db.query.referrals.findMany({
    where,
    with: {
      patient: { columns: { id: true, first_name: true, last_name: true, mrn: true } },
      from_doctor: { columns: { id: true, first_name: true, last_name: true, specialty: true } },
      to_doctor: { columns: { id: true, first_name: true, last_name: true, specialty: true } },
      to_department: { columns: { id: true, name: true, type: true } },
    },
    orderBy: desc(referrals.created_at),
    limit: 100,
  })
}

// ─── Get single ───────────────────────────────────────────────────────────────

export async function getReferral(tenantId: string, referralId: string, actorId: string) {
  const referral = await db.query.referrals.findFirst({
    where: and(eq(referrals.tenant_id, tenantId), eq(referrals.id, referralId)),
    with: {
      patient: { columns: { id: true, first_name: true, last_name: true, mrn: true, date_of_birth: true } },
      from_doctor: { columns: { id: true, first_name: true, last_name: true, specialty: true, email: true } },
      to_doctor: { columns: { id: true, first_name: true, last_name: true, specialty: true, email: true } },
      to_department: { columns: { id: true, name: true, type: true } },
    },
  })

  if (!referral) throw new NotFoundError('Referral')

  // Only the sending or receiving doctor (or admin) can see the referral
  if (referral.from_doctor_id !== actorId && referral.to_doctor_id !== actorId) {
    throw new ForbiddenError('Access denied')
  }

  return referral
}

// ─── Accept ───────────────────────────────────────────────────────────────────

export async function acceptReferral(
  tenantId: string,
  referralId: string,
  actorId: string,
  actorEmail: string,
  input: RespondReferralInput,
) {
  const referral = await db.query.referrals.findFirst({
    where: and(eq(referrals.tenant_id, tenantId), eq(referrals.id, referralId)),
    with: {
      patient: { columns: { first_name: true, last_name: true, mrn: true } },
      from_doctor: { columns: { id: true, first_name: true, last_name: true, email: true } },
    },
  })

  if (!referral) throw new NotFoundError('Referral')
  if (referral.to_doctor_id !== actorId) throw new ForbiddenError('Solo el médico receptor puede aceptar la derivación')
  if (referral.status !== 'PENDING') throw new ForbiddenError(`Cannot accept a referral in status ${referral.status}`)

  const actor = await getDoctorContact(actorId)

  const [updated] = await db
    .update(referrals)
    .set({ status: 'ACCEPTED', response_notes: input.notes ?? null, responded_at: new Date(), updated_at: new Date() })
    .where(eq(referrals.id, referralId))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'REFERRAL_ACCEPTED',
    resource_type: 'REFERRAL',
    resource_id: referralId,
    context: { patient_id: referral.patient_id },
  })

  if (referral.from_doctor?.email) {
    const patientName = referral.patient
      ? `${referral.patient.first_name} ${referral.patient.last_name}${referral.patient.mrn ? ` (${referral.patient.mrn})` : ''}`
      : 'el paciente'
    void sendDoctorEventEmail({
      recipientEmail: referral.from_doctor.email,
      recipientFirstName: referral.from_doctor.first_name,
      eventTitle: 'Derivación aceptada',
      eventBody: `Dr. ${actor?.first_name ?? ''} ${actor?.last_name ?? ''} ha <strong>aceptado</strong> tu derivación de ${patientName}.${input.notes ? `<br><br><em>Nota: ${input.notes}</em>` : ''}`,
      ctaLabel: 'Ver derivaciones',
      ctaUrl: `${APP_URL}/referrals`,
    })
  }

  return updated
}

// ─── Reject ───────────────────────────────────────────────────────────────────

export async function rejectReferral(
  tenantId: string,
  referralId: string,
  actorId: string,
  actorEmail: string,
  input: RespondReferralInput,
) {
  const referral = await db.query.referrals.findFirst({
    where: and(eq(referrals.tenant_id, tenantId), eq(referrals.id, referralId)),
    with: {
      patient: { columns: { first_name: true, last_name: true, mrn: true } },
      from_doctor: { columns: { id: true, first_name: true, last_name: true, email: true } },
    },
  })

  if (!referral) throw new NotFoundError('Referral')
  if (referral.to_doctor_id !== actorId) throw new ForbiddenError('Solo el médico receptor puede rechazar la derivación')
  if (referral.status !== 'PENDING') throw new ForbiddenError(`Cannot reject a referral in status ${referral.status}`)

  const actor = await getDoctorContact(actorId)

  const [updated] = await db
    .update(referrals)
    .set({ status: 'REJECTED', response_notes: input.notes ?? null, responded_at: new Date(), updated_at: new Date() })
    .where(eq(referrals.id, referralId))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'REFERRAL_REJECTED',
    resource_type: 'REFERRAL',
    resource_id: referralId,
    context: { patient_id: referral.patient_id },
  })

  if (referral.from_doctor?.email) {
    const patientName = referral.patient
      ? `${referral.patient.first_name} ${referral.patient.last_name}${referral.patient.mrn ? ` (${referral.patient.mrn})` : ''}`
      : 'el paciente'
    void sendDoctorEventEmail({
      recipientEmail: referral.from_doctor.email,
      recipientFirstName: referral.from_doctor.first_name,
      eventTitle: 'Derivación rechazada',
      eventBody: `Dr. ${actor?.first_name ?? ''} ${actor?.last_name ?? ''} ha <strong>rechazado</strong> tu derivación de ${patientName}.${input.notes ? `<br><br><em>Motivo: ${input.notes}</em>` : ''}`,
      ctaLabel: 'Ver derivaciones',
      ctaUrl: `${APP_URL}/referrals`,
    })
  }

  return updated
}

// ─── Complete ─────────────────────────────────────────────────────────────────

export async function completeReferral(
  tenantId: string,
  referralId: string,
  actorId: string,
  actorEmail: string,
  input: RespondReferralInput,
) {
  const referral = await db.query.referrals.findFirst({
    where: and(eq(referrals.tenant_id, tenantId), eq(referrals.id, referralId)),
    with: {
      patient: { columns: { first_name: true, last_name: true, mrn: true } },
      from_doctor: { columns: { id: true, first_name: true, last_name: true, email: true } },
    },
  })

  if (!referral) throw new NotFoundError('Referral')
  if (referral.to_doctor_id !== actorId) throw new ForbiddenError('Solo el médico receptor puede completar la derivación')
  if (referral.status !== 'ACCEPTED') throw new ForbiddenError(`Cannot complete a referral in status ${referral.status}`)

  const actor = await getDoctorContact(actorId)

  const [updated] = await db
    .update(referrals)
    .set({ status: 'COMPLETED', response_notes: input.notes ?? null, completed_at: new Date(), updated_at: new Date() })
    .where(eq(referrals.id, referralId))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'REFERRAL_COMPLETED',
    resource_type: 'REFERRAL',
    resource_id: referralId,
    context: { patient_id: referral.patient_id },
  })

  if (referral.from_doctor?.email) {
    const patientName = referral.patient
      ? `${referral.patient.first_name} ${referral.patient.last_name}${referral.patient.mrn ? ` (${referral.patient.mrn})` : ''}`
      : 'el paciente'
    void sendDoctorEventEmail({
      recipientEmail: referral.from_doctor.email,
      recipientFirstName: referral.from_doctor.first_name,
      eventTitle: 'Derivación completada',
      eventBody: `Dr. ${actor?.first_name ?? ''} ${actor?.last_name ?? ''} ha marcado como <strong>completada</strong> la derivación de ${patientName}.${input.notes ? `<br><br><em>Nota de cierre: ${input.notes}</em>` : ''}`,
      ctaLabel: 'Ver expediente',
      ctaUrl: `${APP_URL}/patients/${referral.patient_id}`,
    })
  }

  return updated
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

export async function cancelReferral(
  tenantId: string,
  referralId: string,
  actorId: string,
  actorEmail: string,
) {
  const referral = await db.query.referrals.findFirst({
    where: and(eq(referrals.tenant_id, tenantId), eq(referrals.id, referralId)),
    columns: { id: true, status: true, from_doctor_id: true, patient_id: true },
  })

  if (!referral) throw new NotFoundError('Referral')
  if (referral.from_doctor_id !== actorId) throw new ForbiddenError('Solo el médico emisor puede cancelar la derivación')
  if (!['PENDING', 'ACCEPTED'].includes(referral.status)) {
    throw new ForbiddenError(`Cannot cancel a referral in status ${referral.status}`)
  }

  const [updated] = await db
    .update(referrals)
    .set({ status: 'CANCELLED', updated_at: new Date() })
    .where(eq(referrals.id, referralId))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'REFERRAL_CANCELLED',
    resource_type: 'REFERRAL',
    resource_id: referralId,
    context: { patient_id: referral.patient_id },
  })

  return updated
}
