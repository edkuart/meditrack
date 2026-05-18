import { eq, and, desc } from 'drizzle-orm'
import { db, hospitalAdmissions, patients, departments, referrals } from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { NotFoundError, ForbiddenError } from '../../shared/errors.ts'
import type { AdmitPatientInput, DischargePatientInput } from './admissions.schema.ts'

// ─── Admit ─────────────────────────────────────────────────────────────────────

export async function admitPatient(
  tenantId: string,
  doctorId: string,
  doctorEmail: string,
  patientId: string,
  input: AdmitPatientInput,
) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  // One active admission per patient
  const existing = await db.query.hospitalAdmissions.findFirst({
    where: and(
      eq(hospitalAdmissions.tenant_id, tenantId),
      eq(hospitalAdmissions.patient_id, patientId),
      eq(hospitalAdmissions.status, 'ACTIVE'),
    ),
    columns: { id: true },
  })
  if (existing) throw new ForbiddenError('El paciente ya tiene un internamiento activo')

  if (input.department_id) {
    const dept = await db.query.departments.findFirst({
      where: and(eq(departments.tenant_id, tenantId), eq(departments.id, input.department_id)),
      columns: { id: true },
    })
    if (!dept) throw new NotFoundError('Department')
  }

  if (input.referral_id) {
    const ref = await db.query.referrals.findFirst({
      where: and(eq(referrals.tenant_id, tenantId), eq(referrals.id, input.referral_id)),
      columns: { id: true },
    })
    if (!ref) throw new NotFoundError('Referral')
  }

  const [admission] = await db
    .insert(hospitalAdmissions)
    .values({
      tenant_id: tenantId,
      patient_id: patientId,
      admitted_by: doctorId,
      department_id: input.department_id ?? null,
      referral_id: input.referral_id ?? null,
      bed_code: input.bed_code ?? null,
      admission_notes: input.admission_notes ?? null,
      status: 'ACTIVE',
    })
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: doctorId,
    actor_type: 'USER',
    actor_email: doctorEmail,
    action: 'PATIENT_ADMITTED',
    resource_type: 'ADMISSION',
    resource_id: admission.id,
    context: { patient_id: patientId, department_id: input.department_id, bed_code: input.bed_code },
  })

  return getAdmission(tenantId, admission.id)
}

// ─── Discharge ─────────────────────────────────────────────────────────────────

export async function dischargePatient(
  tenantId: string,
  doctorId: string,
  doctorEmail: string,
  admissionId: string,
  input: DischargePatientInput,
) {
  const admission = await db.query.hospitalAdmissions.findFirst({
    where: and(eq(hospitalAdmissions.tenant_id, tenantId), eq(hospitalAdmissions.id, admissionId)),
    columns: { id: true, status: true, patient_id: true },
  })

  if (!admission) throw new NotFoundError('Admission')
  if (admission.status !== 'ACTIVE') throw new ForbiddenError('El internamiento ya fue dado de alta')

  const [updated] = await db
    .update(hospitalAdmissions)
    .set({
      status: 'DISCHARGED',
      discharge_notes: input.discharge_notes ?? null,
      discharged_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(hospitalAdmissions.id, admissionId))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: doctorId,
    actor_type: 'USER',
    actor_email: doctorEmail,
    action: 'PATIENT_DISCHARGED',
    resource_type: 'ADMISSION',
    resource_id: admissionId,
    context: { patient_id: admission.patient_id },
  })

  return updated
}

// ─── List patient admissions ──────────────────────────────────────────────────

export async function listPatientAdmissions(tenantId: string, patientId: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  return db.query.hospitalAdmissions.findMany({
    where: and(
      eq(hospitalAdmissions.tenant_id, tenantId),
      eq(hospitalAdmissions.patient_id, patientId),
    ),
    with: {
      admitted_by_doctor: { columns: { id: true, first_name: true, last_name: true, specialty: true } },
      department: { columns: { id: true, name: true, type: true } },
      referral: { columns: { id: true, reason: true, priority: true } },
    },
    orderBy: desc(hospitalAdmissions.admitted_at),
  })
}

// ─── Hospital census (all active admissions for tenant) ───────────────────────

export async function getHospitalCensus(tenantId: string) {
  return db.query.hospitalAdmissions.findMany({
    where: and(
      eq(hospitalAdmissions.tenant_id, tenantId),
      eq(hospitalAdmissions.status, 'ACTIVE'),
    ),
    with: {
      patient: { columns: { id: true, first_name: true, last_name: true, mrn: true, date_of_birth: true } },
      admitted_by_doctor: { columns: { id: true, first_name: true, last_name: true, specialty: true } },
      department: { columns: { id: true, name: true, type: true } },
    },
    orderBy: desc(hospitalAdmissions.admitted_at),
  })
}

// ─── Get single admission ─────────────────────────────────────────────────────

async function getAdmission(tenantId: string, admissionId: string) {
  return db.query.hospitalAdmissions.findFirst({
    where: and(eq(hospitalAdmissions.tenant_id, tenantId), eq(hospitalAdmissions.id, admissionId)),
    with: {
      patient: { columns: { id: true, first_name: true, last_name: true, mrn: true } },
      admitted_by_doctor: { columns: { id: true, first_name: true, last_name: true, specialty: true } },
      department: { columns: { id: true, name: true, type: true } },
      referral: { columns: { id: true, reason: true, priority: true } },
    },
  })
}
