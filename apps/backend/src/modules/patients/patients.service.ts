import { eq, and, or, ilike, sql, desc, count } from 'drizzle-orm'
import { db, patients, encounters, treatmentPlans } from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { assertPatientLimit } from '../../shared/services/limits.service.ts'
import { NotFoundError, ConflictError } from '../../shared/errors.ts'
import type { CreatePatientInput, UpdatePatientInput, SearchPatientsInput } from './patients.schema.ts'

// ─── Search ────────────────────────────────────────────────────────────────────

export async function searchPatients(tenantId: string, input: SearchPatientsInput) {
  const { q, page, limit } = input
  const offset = (page - 1) * limit

  const baseWhere = eq(patients.tenant_id, tenantId)

  const searchWhere = q
    ? or(
        // Full name match (first + last)
        sql`LOWER(${patients.first_name} || ' ' || ${patients.last_name}) LIKE LOWER(${'%' + q + '%'})`,
        // Last name first (common in Spanish-speaking countries)
        sql`LOWER(${patients.last_name} || ' ' || ${patients.first_name}) LIKE LOWER(${'%' + q + '%'})`,
        ilike(patients.id_number, `%${q}%`),
        ilike(patients.phone, `%${q}%`),
      )
    : undefined

  const where = searchWhere ? and(baseWhere, searchWhere) : baseWhere

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: patients.id,
        first_name: patients.first_name,
        last_name: patients.last_name,
        date_of_birth: patients.date_of_birth,
        sex: patients.sex,
        phone: patients.phone,
        email: patients.email,
        id_number: patients.id_number,
        tags: patients.tags,
        is_active: patients.is_active,
        created_at: patients.created_at,
      })
      .from(patients)
      .where(where)
      .orderBy(desc(patients.created_at))
      .limit(limit)
      .offset(offset),

    db
      .select({ total: count() })
      .from(patients)
      .where(where),
  ])

  return {
    patients: rows,
    meta: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
  }
}

// ─── Create ────────────────────────────────────────────────────────────────────

export async function createPatient(
  tenantId: string,
  doctorId: string,
  doctorEmail: string,
  input: CreatePatientInput,
) {
  await assertPatientLimit(tenantId)

  // Deduplication: warn if same id_number already exists in this tenant
  if (input.id_number) {
    const existing = await db.query.patients.findFirst({
      where: and(
        eq(patients.tenant_id, tenantId),
        eq(patients.id_number, input.id_number),
      ),
      columns: { id: true, first_name: true, last_name: true },
    })

    if (existing) {
      throw new ConflictError(
        `A patient with ID number ${input.id_number} already exists: ${existing.first_name} ${existing.last_name}`,
        'PATIENT_DUPLICATE_ID',
      )
    }
  }

  const [patient] = await db
    .insert(patients)
    .values({
      tenant_id: tenantId,
      created_by: doctorId,
      ...input,
      tags: input.tags as string[],
    })
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: doctorId,
    actor_type: 'USER',
    actor_email: doctorEmail,
    action: 'PATIENT_CREATED',
    resource_type: 'PATIENT',
    resource_id: patient.id,
  })

  return patient
}

// ─── Get by ID ────────────────────────────────────────────────────────────────

export async function getPatientById(
  tenantId: string,
  patientId: string,
  actorId: string,
  actorEmail: string,
) {
  const patient = await db.query.patients.findFirst({
    where: and(
      eq(patients.tenant_id, tenantId),
      eq(patients.id, patientId),
    ),
  })

  if (!patient) throw new NotFoundError('Patient')

  // Fetch summary stats alongside
  const [encounterCount] = await db
    .select({ total: count() })
    .from(encounters)
    .where(and(
      eq(encounters.tenant_id, tenantId),
      eq(encounters.patient_id, patientId),
    ))

  const activeTreatment = await db.query.treatmentPlans.findFirst({
    where: and(
      eq(treatmentPlans.patient_id, patientId),
      eq(treatmentPlans.status, 'ACTIVE'),
    ),
    columns: { id: true, name: true, start_date: true, end_date: true, status: true },
    orderBy: (t, { desc }) => desc(t.created_at),
  })

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'PATIENT_VIEWED',
    resource_type: 'PATIENT',
    resource_id: patientId,
  })

  return {
    ...patient,
    _summary: {
      encounter_count: Number(encounterCount.total),
      active_treatment: activeTreatment ?? null,
    },
  }
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updatePatient(
  tenantId: string,
  patientId: string,
  actorId: string,
  actorEmail: string,
  input: UpdatePatientInput,
) {
  const existing = await db.query.patients.findFirst({
    where: and(
      eq(patients.tenant_id, tenantId),
      eq(patients.id, patientId),
    ),
  })

  if (!existing) throw new NotFoundError('Patient')

  // Dedup check on id_number change
  if (input.id_number && input.id_number !== existing.id_number) {
    const duplicate = await db.query.patients.findFirst({
      where: and(
        eq(patients.tenant_id, tenantId),
        eq(patients.id_number, input.id_number),
      ),
      columns: { id: true },
    })

    if (duplicate && duplicate.id !== patientId) {
      throw new ConflictError(
        `Another patient with ID number ${input.id_number} already exists`,
        'PATIENT_DUPLICATE_ID',
      )
    }
  }

  const [updated] = await db
    .update(patients)
    .set({ ...input, updated_at: new Date() })
    .where(and(
      eq(patients.tenant_id, tenantId),
      eq(patients.id, patientId),
    ))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'PATIENT_UPDATED',
    resource_type: 'PATIENT',
    resource_id: patientId,
    changes: { before: existing, after: updated },
  })

  return updated
}

// ─── Deactivate ───────────────────────────────────────────────────────────────

export async function deactivatePatient(
  tenantId: string,
  patientId: string,
  actorId: string,
  actorEmail: string,
) {
  const existing = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })

  if (!existing) throw new NotFoundError('Patient')

  await db
    .update(patients)
    .set({ is_active: false, updated_at: new Date() })
    .where(and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)))

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'PATIENT_UPDATED',
    resource_type: 'PATIENT',
    resource_id: patientId,
    changes: { before: { is_active: true }, after: { is_active: false } },
  })
}
