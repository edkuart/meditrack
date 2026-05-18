import { eq, and } from 'drizzle-orm'
import { db, patients, departments, patientDepartmentAccess } from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { NotFoundError } from '../../shared/errors.ts'

// ─── Grant access ──────────────────────────────────────────────────────────────

export async function grantDepartmentAccess(
  tenantId: string,
  actorId: string,
  actorEmail: string,
  patientId: string,
  departmentId: string,
  accessType: 'FULL' | 'READ_ONLY' | 'LAB_ONLY',
  opts?: { expires_at?: Date; notes?: string },
) {
  const [patient, department] = await Promise.all([
    db.query.patients.findFirst({
      where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
      columns: { id: true },
    }),
    db.query.departments.findFirst({
      where: and(eq(departments.tenant_id, tenantId), eq(departments.id, departmentId)),
      columns: { id: true, name: true },
    }),
  ])

  if (!patient) throw new NotFoundError('Patient')
  if (!department) throw new NotFoundError('Department')

  const [record] = await db
    .insert(patientDepartmentAccess)
    .values({
      tenant_id: tenantId,
      patient_id: patientId,
      department_id: departmentId,
      granted_by: actorId,
      access_type: accessType,
      expires_at: opts?.expires_at ?? null,
      notes: opts?.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [patientDepartmentAccess.patient_id, patientDepartmentAccess.department_id],
      set: {
        access_type: accessType,
        expires_at: opts?.expires_at ?? null,
        notes: opts?.notes ?? null,
        granted_by: actorId,
        granted_at: new Date(),
      },
    })
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'PATIENT_ACCESS_GRANTED',
    resource_type: 'PATIENT',
    resource_id: patientId,
    context: { department_id: departmentId, access_type: accessType },
  })

  return record
}

// ─── Revoke access ─────────────────────────────────────────────────────────────

export async function revokeDepartmentAccess(
  tenantId: string,
  actorId: string,
  actorEmail: string,
  patientId: string,
  departmentId: string,
) {
  const existing = await db.query.patientDepartmentAccess.findFirst({
    where: and(
      eq(patientDepartmentAccess.tenant_id, tenantId),
      eq(patientDepartmentAccess.patient_id, patientId),
      eq(patientDepartmentAccess.department_id, departmentId),
    ),
    columns: { id: true },
  })

  if (!existing) throw new NotFoundError('Access grant')

  await db
    .delete(patientDepartmentAccess)
    .where(and(
      eq(patientDepartmentAccess.patient_id, patientId),
      eq(patientDepartmentAccess.department_id, departmentId),
    ))

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'PATIENT_ACCESS_REVOKED',
    resource_type: 'PATIENT',
    resource_id: patientId,
    context: { department_id: departmentId },
  })
}

// ─── List access grants ────────────────────────────────────────────────────────

export async function listPatientAccess(tenantId: string, patientId: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  return db.query.patientDepartmentAccess.findMany({
    where: and(
      eq(patientDepartmentAccess.tenant_id, tenantId),
      eq(patientDepartmentAccess.patient_id, patientId),
    ),
    with: {
      department: { columns: { id: true, name: true, type: true } },
      granted_by_user: { columns: { id: true, first_name: true, last_name: true } },
    },
  })
}

// ─── Check access (used by middleware / other services) ───────────────────────

export async function hasDepartmentAccess(
  tenantId: string,
  patientId: string,
  departmentId: string,
): Promise<boolean> {
  const record = await db.query.patientDepartmentAccess.findFirst({
    where: and(
      eq(patientDepartmentAccess.tenant_id, tenantId),
      eq(patientDepartmentAccess.patient_id, patientId),
      eq(patientDepartmentAccess.department_id, departmentId),
    ),
    columns: { expires_at: true },
  })

  if (!record) return false
  if (record.expires_at && record.expires_at < new Date()) return false
  return true
}
