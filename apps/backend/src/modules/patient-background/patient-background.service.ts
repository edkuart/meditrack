import { eq, and, desc } from 'drizzle-orm'
import { db, patientBackground, patients } from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { NotFoundError } from '../../shared/errors.ts'
import type { UpsertBackgroundInput } from './patient-background.schema.ts'

export async function getPatientBackground(tenantId: string, patientId: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  return db
    .select()
    .from(patientBackground)
    .where(and(
      eq(patientBackground.tenant_id, tenantId),
      eq(patientBackground.patient_id, patientId),
      eq(patientBackground.is_current, true),
    ))
}

export async function getPatientBackgroundHistory(tenantId: string, patientId: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  return db
    .select()
    .from(patientBackground)
    .where(and(
      eq(patientBackground.tenant_id, tenantId),
      eq(patientBackground.patient_id, patientId),
    ))
    .orderBy(desc(patientBackground.recorded_at), desc(patientBackground.created_at))
}

export async function upsertBackground(
  tenantId: string,
  patientId: string,
  actorId: string,
  actorEmail: string,
  input: UpsertBackgroundInput,
) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  // Marcar registro anterior de la misma categoría como no vigente
  await db
    .update(patientBackground)
    .set({
      is_current: false,
      retired_by: actorId,
      retired_at: new Date(),
      retired_reason: 'UPDATED_BY_NEWER_RECORD',
    })
    .where(and(
      eq(patientBackground.tenant_id, tenantId),
      eq(patientBackground.patient_id, patientId),
      eq(patientBackground.category, input.category),
      eq(patientBackground.is_current, true),
    ))

  const [record] = await db
    .insert(patientBackground)
    .values({
      tenant_id: tenantId,
      patient_id: patientId,
      category: input.category,
      content: input.content,
      is_current: true,
      recorded_by: actorId,
    })
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'PATIENT_UPDATED',
    resource_type: 'PATIENT',
    resource_id: patientId,
    context: { action: 'BACKGROUND_UPDATED', category: input.category },
  })

  return record
}

export async function retireBackground(
  tenantId: string,
  patientId: string,
  actorId: string,
  actorEmail: string,
  category: UpsertBackgroundInput['category'],
) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  const [record] = await db
    .update(patientBackground)
    .set({
      is_current: false,
      retired_by: actorId,
      retired_at: new Date(),
      retired_reason: 'REMOVED_BY_USER',
    })
    .where(and(
      eq(patientBackground.tenant_id, tenantId),
      eq(patientBackground.patient_id, patientId),
      eq(patientBackground.category, category),
      eq(patientBackground.is_current, true),
    ))
    .returning()

  if (!record) throw new NotFoundError('Patient background')

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'PATIENT_UPDATED',
    resource_type: 'PATIENT',
    resource_id: patientId,
    context: { action: 'BACKGROUND_RETIRED', category },
  })

  return record
}
