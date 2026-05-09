import { eq, and, desc, isNull } from 'drizzle-orm'
import { db, patients, patientConsents, users, encounters, treatmentPlans } from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { NotFoundError, ForbiddenError } from '../../shared/errors.ts'

// ─── Consent management ───────────────────────────────────────────────────────

export interface RecordConsentInput {
  consent_type: 'data_processing' | 'treatment' | 'third_party_sharing' | 'research' | 'marketing'
  description?: string
  consented_at: string
  ip_address?: string
  notes?: string
}

export async function getPatientConsents(tenantId: string, patientId: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.id, patientId), eq(patients.tenant_id, tenantId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  return db.query.patientConsents.findMany({
    where: eq(patientConsents.patient_id, patientId),
    orderBy: [desc(patientConsents.consented_at)],
  })
}

export async function recordConsent(
  tenantId: string,
  patientId: string,
  actorId: string,
  actorEmail: string,
  input: RecordConsentInput,
) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.id, patientId), eq(patients.tenant_id, tenantId)),
    columns: { id: true, anonymized_at: true },
  })
  if (!patient) throw new NotFoundError('Patient')
  if (patient.anonymized_at) throw new ForbiddenError('Cannot record consent for anonymized patient')

  const [consent] = await db.insert(patientConsents).values({
    tenant_id: tenantId,
    patient_id: patientId,
    consent_type: input.consent_type,
    description: input.description,
    recorded_by: actorId,
    recorded_by_email: actorEmail,
    consented_at: new Date(input.consented_at),
    ip_address: input.ip_address,
    notes: input.notes,
  }).returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'CONSENT_RECORDED',
    resource_type: 'PATIENT',
    resource_id: patientId,
    context: { consent_id: consent!.id, consent_type: input.consent_type },
  })

  return consent!
}

export async function withdrawConsent(
  tenantId: string,
  patientId: string,
  consentId: string,
  actorId: string,
  actorEmail: string,
) {
  const consent = await db.query.patientConsents.findFirst({
    where: and(
      eq(patientConsents.id, consentId),
      eq(patientConsents.patient_id, patientId),
      eq(patientConsents.tenant_id, tenantId),
      isNull(patientConsents.withdrawn_at),
    ),
    columns: { id: true },
  })
  if (!consent) throw new NotFoundError('Consent')

  await db.update(patientConsents)
    .set({ withdrawn_at: new Date(), withdrawn_by: actorId })
    .where(eq(patientConsents.id, consentId))

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'CONSENT_WITHDRAWN',
    resource_type: 'PATIENT',
    resource_id: patientId,
    context: { consent_id: consentId },
  })
}

// ─── GDPR: Patient data export ────────────────────────────────────────────────

export async function exportPatientData(tenantId: string, patientId: string, actorId: string, actorEmail: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.id, patientId), eq(patients.tenant_id, tenantId)),
  })
  if (!patient) throw new NotFoundError('Patient')

  const [patientEncounters, patientTreatments, consentRecords] = await Promise.all([
    db.query.encounters.findMany({
      where: and(
        eq(encounters.patient_id, patientId),
        eq(encounters.tenant_id, tenantId),
      ),
      columns: {
        id: true,
        status: true,
        chief_complaint: true,
        notes: true,
        summary: true,
        opened_at: true,
        closed_at: true,
      },
      orderBy: (t, { desc: d }) => d(t.opened_at),
    }),
    db.query.treatmentPlans.findMany({
      where: and(
        eq(treatmentPlans.patient_id, patientId),
        eq(treatmentPlans.tenant_id, tenantId),
      ),
      columns: {
        id: true,
        status: true,
        start_date: true,
        end_date: true,
        created_at: true,
      },
      orderBy: (t, { desc: d }) => d(t.created_at),
    }),
    db.query.patientConsents.findMany({
      where: eq(patientConsents.patient_id, patientId),
      orderBy: [desc(patientConsents.consented_at)],
    }),
  ])

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'DATA_EXPORT_REQUESTED',
    resource_type: 'PATIENT',
    resource_id: patientId,
  })

  return {
    exported_at: new Date().toISOString(),
    patient: {
      id: patient.id,
      first_name: patient.first_name,
      last_name: patient.last_name,
      date_of_birth: patient.date_of_birth,
      sex: patient.sex,
      phone: patient.phone,
      email: patient.email,
      id_number: patient.id_number,
      created_at: patient.created_at,
      anonymized_at: patient.anonymized_at,
    },
    encounters: patientEncounters,
    treatments: patientTreatments,
    consents: consentRecords,
  }
}

// ─── GDPR: Right to erasure (anonymize PII) ───────────────────────────────────

export async function anonymizePatient(tenantId: string, patientId: string, actorId: string, actorEmail: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.id, patientId), eq(patients.tenant_id, tenantId)),
    columns: { id: true, anonymized_at: true },
  })
  if (!patient) throw new NotFoundError('Patient')
  if (patient.anonymized_at) {
    return { already_anonymized: true, anonymized_at: patient.anonymized_at }
  }

  const now = new Date()

  // Null out all PII; medical data (encounters, treatments, doses) is retained for legal purposes
  await db.update(patients)
    .set({
      first_name: '[anonymized]',
      last_name: '[anonymized]',
      date_of_birth: null,
      sex: null,
      phone: null,
      email: null,
      id_number: null,
      notes: null,
      emergency_contact: null,
      anonymized_at: now,
      updated_at: now,
    })
    .where(and(eq(patients.id, patientId), eq(patients.tenant_id, tenantId)))

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'PATIENT_ANONYMIZED',
    resource_type: 'PATIENT',
    resource_id: patientId,
  })

  return { already_anonymized: false, anonymized_at: now }
}

// ─── Legal acceptance: ToS + Privacy Policy ───────────────────────────────────

export async function acceptLegal(
  userId: string,
  tenantId: string,
  actorEmail: string,
  type: 'tos' | 'privacy',
) {
  const now = new Date()
  const field = type === 'tos' ? { tos_accepted_at: now } : { privacy_policy_accepted_at: now }

  await db.update(users).set(field).where(eq(users.id, userId))

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: userId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: type === 'tos' ? 'TOS_ACCEPTED' : 'PRIVACY_POLICY_ACCEPTED',
    resource_type: 'USER',
    resource_id: userId,
  })

  return { accepted_at: now }
}

export async function getLegalStatus(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      tos_accepted_at: true,
      privacy_policy_accepted_at: true,
    },
  })
  if (!user) throw new NotFoundError('User')
  return user
}
