import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db, patients, treatmentPlans, medicationItems } from '../../shared/db/index.ts'
import { NotFoundError } from '../../shared/errors.ts'

// ─── Minimal inline FHIR R4 types ─────────────────────────────────────────────

type FhirCoding = { system?: string; code?: string; display?: string }
type FhirCodeableConcept = { coding?: FhirCoding[]; text?: string }
type FhirQuantity = { value: number; unit: string }

type FhirPatient = {
  resourceType: 'Patient'
  id: string
  meta: { profile: string[]; lastUpdated: string }
  identifier: Array<{ system: string; value: string; type?: FhirCodeableConcept }>
  name: Array<{ family: string; given: string[] }>
  telecom?: Array<{ system: string; value: string; use?: string }>
  gender: string
  birthDate?: string
  active: boolean
}

type FhirDosage = {
  text: string
  timing?: {
    repeat?: {
      frequency?: number
      period?: number
      periodUnit?: string
      timeOfDay?: string[]
    }
    code?: FhirCodeableConcept
  }
  asNeededBoolean?: boolean
  route?: FhirCodeableConcept
  doseAndRate: Array<{ doseQuantity: FhirQuantity }>
  additionalInstruction?: FhirCodeableConcept[]
  patientInstruction?: string
}

type FhirMedicationRequest = {
  resourceType: 'MedicationRequest'
  id: string
  status: string
  intent: 'order'
  medicationCodeableConcept: FhirCodeableConcept
  subject: { reference: string }
  authoredOn: string
  dosageInstruction: FhirDosage[]
  note?: Array<{ text: string }>
}

type FhirBundle = {
  resourceType: 'Bundle'
  id: string
  meta: { lastUpdated: string }
  type: 'collection'
  timestamp: string
  entry: Array<{ fullUrl: string; resource: FhirPatient | FhirMedicationRequest }>
}

// ─── Converters ────────────────────────────────────────────────────────────────

function toFhirGender(sex: string | null): string {
  if (sex === 'male') return 'male'
  if (sex === 'female') return 'female'
  if (sex === 'other') return 'other'
  return 'unknown'
}

function toFhirMedReqStatus(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'active'
    case 'COMPLETED': return 'completed'
    case 'SUSPENDED': return 'on-hold'
    case 'CANCELLED': return 'cancelled'
    default: return 'draft'
  }
}

function buildDoseText(med: typeof medicationItems.$inferSelect): string {
  const base = `${med.dose_amount} ${med.dose_unit} de ${med.drug_name}`
  const presentation = med.presentation ? ` (${med.presentation})` : ''
  const route = med.route ? ` vía ${med.route}` : ''
  const food = med.with_food ? ', con alimentos' : ''
  const duration = med.duration_days ? `, ${med.duration_days} días` : ''

  let frequency = ''
  switch (med.frequency_type) {
    case 'DAILY': frequency = ', una vez al día'; break
    case 'EVERY_X_HOURS': frequency = med.frequency_value ? `, cada ${med.frequency_value} h` : ''; break
    case 'WEEKLY': frequency = ', semanalmente'; break
    case 'AS_NEEDED': frequency = ', según necesidad'; break
  }

  return `${base}${presentation}${route}${frequency}${food}${duration}`
}

function buildFhirTiming(med: typeof medicationItems.$inferSelect): FhirDosage['timing'] | undefined {
  switch (med.frequency_type) {
    case 'DAILY':
      return { repeat: { frequency: 1, period: 1, periodUnit: 'd' }, code: { text: 'once daily' } }
    case 'EVERY_X_HOURS':
      return med.frequency_value
        ? { repeat: { frequency: 1, period: med.frequency_value, periodUnit: 'h' } }
        : undefined
    case 'WEEKLY':
      return { repeat: { frequency: 1, period: 1, periodUnit: 'wk' } }
    case 'AS_NEEDED':
    default:
      return undefined
  }
}

// ─── Resource builders ────────────────────────────────────────────────────────

function buildFhirPatient(patient: typeof patients.$inferSelect): FhirPatient {
  const identifier: FhirPatient['identifier'] = [
    { system: 'urn:meditrack:patient', value: patient.id },
  ]
  if (patient.id_number) {
    identifier.push({
      system: 'urn:meditrack:id_number',
      value: patient.id_number,
      type: { text: 'Cédula / ID nacional' },
    })
  }

  const telecom: NonNullable<FhirPatient['telecom']> = []
  if (patient.phone) telecom.push({ system: 'phone', value: patient.phone, use: 'mobile' })
  if (patient.email) telecom.push({ system: 'email', value: patient.email })

  const fhirPatient: FhirPatient = {
    resourceType: 'Patient',
    id: patient.id,
    meta: {
      profile: ['http://hl7.org/fhir/StructureDefinition/Patient'],
      lastUpdated: patient.updated_at.toISOString(),
    },
    identifier,
    name: [{ family: patient.last_name, given: [patient.first_name] }],
    gender: toFhirGender(patient.sex),
    active: patient.is_active,
  }

  if (telecom.length) fhirPatient.telecom = telecom
  if (patient.date_of_birth) fhirPatient.birthDate = patient.date_of_birth

  return fhirPatient
}

function buildFhirMedicationRequest(
  med: typeof medicationItems.$inferSelect,
  plan: { start_date: string; status: string },
  patientId: string,
): FhirMedicationRequest {
  const dosage: FhirDosage = {
    text: buildDoseText(med),
    doseAndRate: [{ doseQuantity: { value: med.dose_amount, unit: med.dose_unit } }],
  }

  const timing = buildFhirTiming(med)
  if (timing) dosage.timing = timing
  if (med.frequency_type === 'AS_NEEDED') dosage.asNeededBoolean = true
  if (med.route) dosage.route = { text: med.route }
  if (med.with_food) dosage.additionalInstruction = [{ text: 'Tomar con alimentos' }]
  if (med.special_instructions) dosage.patientInstruction = med.special_instructions

  return {
    resourceType: 'MedicationRequest',
    id: med.id,
    status: toFhirMedReqStatus(plan.status),
    intent: 'order',
    medicationCodeableConcept: {
      text: med.presentation ? `${med.drug_name} (${med.presentation})` : med.drug_name,
    },
    subject: { reference: `Patient/${patientId}` },
    authoredOn: plan.start_date,
    dosageInstruction: [dosage],
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function buildPatientFhirBundle(tenantId: string, patientId: string): Promise<FhirBundle> {
  const patient = await db.query.patients.findFirst({
    where: eq(patients.id, patientId),
  })
  if (!patient || patient.tenant_id !== tenantId || !patient.is_active) {
    throw new NotFoundError('Patient')
  }

  const plans = await db.query.treatmentPlans.findMany({
    where: eq(treatmentPlans.patient_id, patientId),
    with: {
      medications: {
        where: eq(medicationItems.is_active, true),
        orderBy: (m, { asc }) => asc(m.sort_order),
      },
    },
    orderBy: (p, { desc }) => desc(p.created_at),
  })

  const now = new Date().toISOString()
  const fhirPatient = buildFhirPatient(patient)
  const fhirMedReqs = plans.flatMap(plan =>
    plan.medications.map(med =>
      buildFhirMedicationRequest(med, { start_date: plan.start_date, status: plan.status }, patientId),
    ),
  )

  return {
    resourceType: 'Bundle',
    id: randomUUID(),
    meta: { lastUpdated: now },
    type: 'collection',
    timestamp: now,
    entry: [
      { fullUrl: `Patient/${patient.id}`, resource: fhirPatient },
      ...fhirMedReqs.map(mr => ({ fullUrl: `MedicationRequest/${mr.id}`, resource: mr })),
    ],
  }
}
