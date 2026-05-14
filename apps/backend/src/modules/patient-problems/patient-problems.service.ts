import { eq, and, asc, max } from 'drizzle-orm'
import { db, patientProblems, patients } from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { NotFoundError, ForbiddenError } from '../../shared/errors.ts'
import type { CreateProblemInput, UpdateProblemInput } from './patient-problems.schema.ts'

export async function listProblems(tenantId: string, patientId: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  return db
    .select()
    .from(patientProblems)
    .where(and(eq(patientProblems.tenant_id, tenantId), eq(patientProblems.patient_id, patientId)))
    .orderBy(asc(patientProblems.problem_number))
}

export async function createProblem(
  tenantId: string,
  patientId: string,
  actorId: string,
  actorEmail: string,
  input: CreateProblemInput,
) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  // Número auto-incremental por paciente (lista de Weed)
  const [{ maxNum }] = await db
    .select({ maxNum: max(patientProblems.problem_number) })
    .from(patientProblems)
    .where(and(eq(patientProblems.tenant_id, tenantId), eq(patientProblems.patient_id, patientId)))

  const nextNumber = (maxNum ?? 0) + 1

  const [problem] = await db
    .insert(patientProblems)
    .values({
      tenant_id: tenantId,
      patient_id: patientId,
      problem_number: nextNumber,
      title: input.title,
      description: input.description,
      icd10_code: input.icd10_code,
      icd10_description: input.icd10_description,
      status: input.status,
      onset_date: input.onset_date,
      notes: input.notes,
      identified_in_encounter_id: input.identified_in_encounter_id,
      created_by: actorId,
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
    context: { action: 'PROBLEM_ADDED', problem_id: problem.id, problem_number: nextNumber },
  })

  return problem
}

export async function updateProblem(
  tenantId: string,
  problemId: string,
  actorId: string,
  actorEmail: string,
  input: UpdateProblemInput,
) {
  const existing = await db.query.patientProblems.findFirst({
    where: and(eq(patientProblems.tenant_id, tenantId), eq(patientProblems.id, problemId)),
  })
  if (!existing) throw new NotFoundError('Problem')

  const [updated] = await db
    .update(patientProblems)
    .set({ ...input, updated_at: new Date() })
    .where(and(eq(patientProblems.tenant_id, tenantId), eq(patientProblems.id, problemId)))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'PATIENT_UPDATED',
    resource_type: 'PATIENT',
    resource_id: existing.patient_id,
    context: { action: 'PROBLEM_UPDATED', problem_id: problemId },
  })

  return updated
}
