import { eq, and, desc, count } from 'drizzle-orm'
import { db, encounters, patients, treatmentPlans } from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { NotFoundError, ForbiddenError } from '../../shared/errors.ts'
import type { CreateEncounterInput, UpdateEncounterInput, CloseEncounterInput } from './encounters.schema.ts'

// ─── Create ────────────────────────────────────────────────────────────────────

export async function createEncounter(
  tenantId: string,
  doctorId: string,
  doctorEmail: string,
  patientId: string,
  input: CreateEncounterInput,
) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  const [encounter] = await db
    .insert(encounters)
    .values({
      tenant_id: tenantId,
      patient_id: patientId,
      doctor_id: doctorId,
      encounter_type: input.encounter_type,
      chief_complaint: input.chief_complaint,
      notes: input.notes,
      status: 'OPEN',
    })
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: doctorId,
    actor_type: 'USER',
    actor_email: doctorEmail,
    action: 'ENCOUNTER_OPENED',
    resource_type: 'ENCOUNTER',
    resource_id: encounter.id,
    context: { patient_id: patientId },
  })

  return encounter
}

// ─── List by patient ───────────────────────────────────────────────────────────

export async function listPatientEncounters(tenantId: string, patientId: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  return db
    .select({
      id: encounters.id,
      encounter_type: encounters.encounter_type,
      status: encounters.status,
      chief_complaint: encounters.chief_complaint,
      summary: encounters.summary,
      doctor_id: encounters.doctor_id,
      opened_at: encounters.opened_at,
      closed_at: encounters.closed_at,
    })
    .from(encounters)
    .where(and(eq(encounters.tenant_id, tenantId), eq(encounters.patient_id, patientId)))
    .orderBy(desc(encounters.opened_at))
    .limit(50)
}

// ─── Get by ID ────────────────────────────────────────────────────────────────

export async function getEncounterById(tenantId: string, encounterId: string) {
  const encounter = await db.query.encounters.findFirst({
    where: and(eq(encounters.tenant_id, tenantId), eq(encounters.id, encounterId)),
    with: {
      patient: {
        columns: {
          id: true,
          first_name: true,
          last_name: true,
          date_of_birth: true,
          sex: true,
          phone: true,
        },
      },
      doctor: {
        columns: {
          id: true,
          first_name: true,
          last_name: true,
          specialty: true,
        },
      },
    },
  })
  if (!encounter) throw new NotFoundError('Encounter')

  // Include active treatment plan if any
  const activeTreatment = await db.query.treatmentPlans.findFirst({
    where: and(
      eq(treatmentPlans.patient_id, encounter.patient_id),
      eq(treatmentPlans.encounter_id, encounterId),
    ),
    with: { medications: true },
  })

  return { ...encounter, treatment_plan: activeTreatment ?? null }
}

// ─── Update notes ──────────────────────────────────────────────────────────────

export async function updateEncounter(
  tenantId: string,
  encounterId: string,
  actorId: string,
  actorEmail: string,
  input: UpdateEncounterInput,
) {
  const existing = await db.query.encounters.findFirst({
    where: and(eq(encounters.tenant_id, tenantId), eq(encounters.id, encounterId)),
  })
  if (!existing) throw new NotFoundError('Encounter')
  if (existing.status === 'CLOSED') throw new ForbiddenError('Cannot edit a closed encounter')

  const [updated] = await db
    .update(encounters)
    .set({ ...input, updated_at: new Date() })
    .where(and(eq(encounters.tenant_id, tenantId), eq(encounters.id, encounterId)))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'ENCOUNTER_NOTES_SAVED',
    resource_type: 'ENCOUNTER',
    resource_id: encounterId,
  })

  return updated
}

// ─── Close encounter ──────────────────────────────────────────────────────────

export async function closeEncounter(
  tenantId: string,
  encounterId: string,
  actorId: string,
  actorEmail: string,
  input: CloseEncounterInput,
) {
  const existing = await db.query.encounters.findFirst({
    where: and(eq(encounters.tenant_id, tenantId), eq(encounters.id, encounterId)),
  })
  if (!existing) throw new NotFoundError('Encounter')
  if (existing.status === 'CLOSED') throw new ForbiddenError('Encounter is already closed')

  const [closed] = await db
    .update(encounters)
    .set({
      status: 'CLOSED',
      closed_at: new Date(),
      summary: input.summary,
      notes: input.notes ?? existing.notes,
      updated_at: new Date(),
    })
    .where(and(eq(encounters.tenant_id, tenantId), eq(encounters.id, encounterId)))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'ENCOUNTER_CLOSED',
    resource_type: 'ENCOUNTER',
    resource_id: encounterId,
    context: { patient_id: existing.patient_id },
  })

  return closed
}
