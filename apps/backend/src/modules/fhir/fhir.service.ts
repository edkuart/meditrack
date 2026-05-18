import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import {
  clinicalAudioTranscripts,
  db,
  documents,
  encounters,
  labOrders,
  labResults,
  medicationItems,
  patientBackground,
  patientProblems,
  patients,
  treatmentPlans,
  vitalSigns,
} from '../../shared/db/index.ts'
import { NotFoundError } from '../../shared/errors.ts'

// ─── Minimal inline FHIR R4 shapes ───────────────────────────────────────────

type FhirCoding = { system?: string; code?: string; display?: string }
type FhirCodeableConcept = { coding?: FhirCoding[]; text?: string }
type FhirQuantity = { value: number; unit?: string; system?: string; code?: string }
type FhirReference = { reference: string; display?: string }
type FhirResource = { resourceType: string; id?: string; [key: string]: unknown }
type LabOrderWithResults = typeof labOrders.$inferSelect & {
  results: Array<typeof labResults.$inferSelect>
}

type FhirBundle = {
  resourceType: 'Bundle'
  id: string
  meta: { lastUpdated: string }
  type: 'collection'
  timestamp: string
  entry: Array<{ fullUrl: string; resource: FhirResource }>
}

const LOINC = 'http://loinc.org'
const ICD10 = 'http://hl7.org/fhir/sid/icd-10'

// ─── Converters ───────────────────────────────────────────────────────────────

export function toFhirGender(sex: string | null): string {
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

function toFhirConditionStatus(status: string): string {
  if (status === 'RESOLVED') return 'resolved'
  if (status === 'INACTIVE') return 'inactive'
  return 'active'
}

function toFhirEncounterStatus(status: string): string {
  if (status === 'CLOSED' || status === 'ARCHIVED') return 'finished'
  if (status === 'DRAFT') return 'planned'
  return 'in-progress'
}

function fhirPatientRef(patientId: string): FhirReference {
  return { reference: `Patient/${patientId}` }
}

function fhirEncounterRef(encounterId: string | null): FhirReference | undefined {
  return encounterId ? { reference: `Encounter/${encounterId}` } : undefined
}

function isoDateTime(value: Date | string | null | undefined) {
  if (!value) return undefined
  if (value instanceof Date) return value.toISOString()
  return value
}

function numberValue(value: number | string | null | undefined) {
  if (value == null) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function textNote(text: string | null | undefined) {
  return text ? [{ text }] : undefined
}

export function buildDoseText(med: typeof medicationItems.$inferSelect): string {
  const base = `${med.dose_amount} ${med.dose_unit} de ${med.drug_name}`
  const presentation = med.presentation ? ` (${med.presentation})` : ''
  const route = med.route ? ` via ${med.route}` : ''
  const food = med.with_food ? ', con alimentos' : ''
  const duration = med.duration_days ? `, ${med.duration_days} dias` : ''

  let frequency = ''
  switch (med.frequency_type) {
    case 'DAILY': frequency = ', una vez al dia'; break
    case 'EVERY_X_HOURS': frequency = med.frequency_value ? `, cada ${med.frequency_value} h` : ''; break
    case 'WEEKLY': frequency = ', semanalmente'; break
    case 'AS_NEEDED': frequency = ', segun necesidad'; break
  }

  return `${base}${presentation}${route}${frequency}${food}${duration}`
}

function buildFhirTiming(med: typeof medicationItems.$inferSelect): Record<string, unknown> | undefined {
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

// ─── Resource builders ───────────────────────────────────────────────────────

export function buildFhirPatient(patient: typeof patients.$inferSelect): FhirResource {
  const identifier: Array<{ system: string; value: string; type?: FhirCodeableConcept }> = [
    { system: 'urn:meditrack:patient', value: patient.id },
  ]
  if (patient.mrn) {
    identifier.push({
      system: 'urn:meditrack:mrn',
      value: patient.mrn,
      type: { text: 'Medical Record Number' },
    })
  }
  if (patient.id_number) {
    identifier.push({
      system: 'urn:meditrack:id_number',
      value: patient.id_number,
      type: { text: 'National ID' },
    })
  }

  const telecom: Array<{ system: string; value: string; use?: string }> = []
  if (patient.phone) telecom.push({ system: 'phone', value: patient.phone, use: 'mobile' })
  if (patient.email) telecom.push({ system: 'email', value: patient.email })

  return {
    resourceType: 'Patient',
    id: patient.id,
    meta: {
      profile: ['http://hl7.org/fhir/StructureDefinition/Patient'],
      lastUpdated: patient.updated_at.toISOString(),
    },
    identifier,
    name: [{ family: patient.last_name, given: [patient.first_name] }],
    ...(telecom.length ? { telecom } : {}),
    gender: toFhirGender(patient.sex),
    ...(patient.date_of_birth ? { birthDate: patient.date_of_birth } : {}),
    active: patient.is_active,
  }
}

export function buildFhirMedicationRequest(
  med: typeof medicationItems.$inferSelect,
  plan: { start_date: string; status: string },
  patientId: string,
): FhirResource {
  const dosage: Record<string, unknown> = {
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
    subject: fhirPatientRef(patientId),
    authoredOn: plan.start_date,
    dosageInstruction: [dosage],
  }
}

function buildFhirCondition(problem: typeof patientProblems.$inferSelect): FhirResource {
  return {
    resourceType: 'Condition',
    id: problem.id,
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: toFhirConditionStatus(problem.status) }] },
    code: {
      ...(problem.icd10_code ? { coding: [{ system: ICD10, code: problem.icd10_code, display: problem.icd10_description ?? problem.title }] } : {}),
      text: problem.icd10_description ?? problem.title,
    },
    subject: fhirPatientRef(problem.patient_id),
    ...(problem.identified_in_encounter_id ? { encounter: fhirEncounterRef(problem.identified_in_encounter_id) } : {}),
    ...(problem.onset_date ? { onsetDateTime: problem.onset_date } : {}),
    ...(problem.resolved_date ? { abatementDateTime: problem.resolved_date } : {}),
    note: textNote(problem.notes ?? problem.description),
  }
}

function buildFhirAllergy(item: typeof patientBackground.$inferSelect): FhirResource {
  return {
    resourceType: 'AllergyIntolerance',
    id: item.id,
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }] },
    code: { text: item.content },
    patient: fhirPatientRef(item.patient_id),
    recordedDate: item.recorded_at.toISOString(),
    note: [{ text: item.content }],
  }
}

function buildFhirEncounter(encounter: typeof encounters.$inferSelect): FhirResource {
  const noteText = [
    encounter.subjective ? `S: ${encounter.subjective}` : null,
    encounter.objective ? `O: ${encounter.objective}` : null,
    encounter.assessment ? `A: ${encounter.assessment}` : null,
    encounter.plan ? `P: ${encounter.plan}` : null,
    encounter.summary ? `Resumen: ${encounter.summary}` : null,
  ].filter(Boolean).join('\n')

  return {
    resourceType: 'Encounter',
    id: encounter.id,
    status: toFhirEncounterStatus(encounter.status),
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    type: [{ text: encounter.encounter_type }],
    subject: fhirPatientRef(encounter.patient_id),
    participant: [{ individual: { reference: `Practitioner/${encounter.doctor_id}` } }],
    period: {
      start: encounter.opened_at.toISOString(),
      ...(encounter.closed_at ? { end: encounter.closed_at.toISOString() } : {}),
    },
    reasonCode: encounter.chief_complaint ? [{ text: encounter.chief_complaint }] : undefined,
    note: noteText ? [{ text: noteText }] : undefined,
  }
}

function buildObservation(
  id: string,
  patientId: string,
  code: FhirCodeableConcept,
  effectiveDateTime: string | undefined,
  valueQuantity: FhirQuantity | undefined,
  encounterId?: string | null,
  interpretation?: string,
): FhirResource {
  return {
    resourceType: 'Observation',
    id,
    status: 'final',
    code,
    subject: fhirPatientRef(patientId),
    ...(encounterId ? { encounter: fhirEncounterRef(encounterId) } : {}),
    ...(effectiveDateTime ? { effectiveDateTime } : {}),
    ...(valueQuantity ? { valueQuantity } : {}),
    ...(interpretation ? { interpretation: [{ text: interpretation }] } : {}),
  }
}

function buildVitalObservations(vital: typeof vitalSigns.$inferSelect): FhirResource[] {
  const effective = vital.recorded_at.toISOString()
  const resources: FhirResource[] = []
  if (vital.blood_pressure_systolic && vital.blood_pressure_diastolic) {
    resources.push({
      resourceType: 'Observation',
      id: `${vital.id}-bp`,
      status: 'final',
      code: { coding: [{ system: LOINC, code: '85354-9', display: 'Blood pressure panel' }], text: 'Blood pressure' },
      subject: fhirPatientRef(vital.patient_id),
      ...(vital.encounter_id ? { encounter: fhirEncounterRef(vital.encounter_id) } : {}),
      effectiveDateTime: effective,
      component: [
        {
          code: { coding: [{ system: LOINC, code: '8480-6', display: 'Systolic blood pressure' }] },
          valueQuantity: { value: vital.blood_pressure_systolic, unit: 'mmHg' },
        },
        {
          code: { coding: [{ system: LOINC, code: '8462-4', display: 'Diastolic blood pressure' }] },
          valueQuantity: { value: vital.blood_pressure_diastolic, unit: 'mmHg' },
        },
      ],
    })
  }

  const singleVitals: Array<[string, FhirCodeableConcept, number | undefined, string]> = [
    ['heart-rate', { coding: [{ system: LOINC, code: '8867-4', display: 'Heart rate' }], text: 'Heart rate' }, vital.heart_rate ?? undefined, 'beats/min'],
    ['resp-rate', { coding: [{ system: LOINC, code: '9279-1', display: 'Respiratory rate' }], text: 'Respiratory rate' }, vital.respiratory_rate ?? undefined, 'breaths/min'],
    ['temp', { coding: [{ system: LOINC, code: '8310-5', display: 'Body temperature' }], text: 'Body temperature' }, numberValue(vital.temperature_celsius), 'Cel'],
    ['weight', { coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }], text: 'Body weight' }, numberValue(vital.weight_kg), 'kg'],
    ['height', { coding: [{ system: LOINC, code: '8302-2', display: 'Body height' }], text: 'Body height' }, numberValue(vital.height_cm), 'cm'],
    ['spo2', { coding: [{ system: LOINC, code: '59408-5', display: 'Oxygen saturation in Arterial blood by Pulse oximetry' }], text: 'Oxygen saturation' }, vital.oxygen_saturation ?? undefined, '%'],
    ['glucose', { coding: [{ system: LOINC, code: '2339-0', display: 'Glucose Bld-mCnc' }], text: 'Glucose' }, vital.glucose_mg_dl ?? undefined, 'mg/dL'],
  ]

  for (const [suffix, code, value, unit] of singleVitals) {
    if (value != null) {
      resources.push(buildObservation(`${vital.id}-${suffix}`, vital.patient_id, code, effective, { value, unit }, vital.encounter_id))
    }
  }

  return resources
}

function buildLabObservation(order: LabOrderWithResults, result: typeof labResults.$inferSelect): FhirResource {
  const numeric = numberValue(result.numeric_value)
  return {
    resourceType: 'Observation',
    id: result.id,
    status: result.status === 'PENDING' ? 'registered' : 'final',
    code: { text: result.parameter_name },
    subject: fhirPatientRef(order.patient_id),
    ...(order.encounter_id ? { encounter: fhirEncounterRef(order.encounter_id) } : {}),
    effectiveDateTime: order.ordered_at.toISOString(),
    ...(numeric != null
      ? { valueQuantity: { value: numeric, unit: result.unit ?? undefined } }
      : result.value
        ? { valueString: result.value }
        : {}),
    ...(result.status !== 'NORMAL' && result.status !== 'PENDING' ? { interpretation: [{ text: result.status }] } : {}),
    ...(result.ref_min || result.ref_max || result.ref_text ? {
      referenceRange: [{
        ...(result.ref_min ? { low: { value: numberValue(result.ref_min), unit: result.unit ?? undefined } } : {}),
        ...(result.ref_max ? { high: { value: numberValue(result.ref_max), unit: result.unit ?? undefined } } : {}),
        ...(result.ref_text ? { text: result.ref_text } : {}),
      }],
    } : {}),
    note: textNote(result.notes),
  }
}

function buildDiagnosticReport(order: LabOrderWithResults): FhirResource {
  return {
    resourceType: 'DiagnosticReport',
    id: order.id,
    status: order.status === 'COMPLETED' ? 'final' : order.status === 'CANCELLED' ? 'cancelled' : 'registered',
    category: [{ text: 'Laboratory' }],
    code: { text: 'Laboratory order/results' },
    subject: fhirPatientRef(order.patient_id),
    ...(order.encounter_id ? { encounter: fhirEncounterRef(order.encounter_id) } : {}),
    effectiveDateTime: order.ordered_at.toISOString(),
    issued: isoDateTime(order.updated_at),
    result: order.results.map(result => ({ reference: `Observation/${result.id}` })),
    note: textNote(order.notes),
  }
}

function buildDocumentReference(doc: typeof documents.$inferSelect): FhirResource {
  return {
    resourceType: 'DocumentReference',
    id: doc.id,
    status: 'current',
    type: { text: doc.type },
    subject: fhirPatientRef(doc.patient_id),
    ...(doc.encounter_id ? { context: { encounter: [fhirEncounterRef(doc.encounter_id)] } } : {}),
    date: doc.created_at.toISOString(),
    content: [{
      attachment: {
        contentType: doc.mime_type,
        title: doc.file_name,
        size: doc.file_size,
        hash: doc.checksum,
      },
    }],
  }
}

function buildTranscriptDocumentReference(transcript: typeof clinicalAudioTranscripts.$inferSelect): FhirResource {
  return {
    resourceType: 'DocumentReference',
    id: transcript.id,
    status: transcript.status === 'ARCHIVED' ? 'superseded' : 'current',
    type: { text: 'Clinical audio transcript' },
    subject: fhirPatientRef(transcript.patient_id),
    ...(transcript.encounter_id ? { context: { encounter: [fhirEncounterRef(transcript.encounter_id)] } } : {}),
    date: transcript.created_at.toISOString(),
    description: transcript.summary ?? transcript.source_label ?? 'Clinical audio transcript',
    content: [{
      attachment: {
        contentType: 'text/plain',
        language: transcript.language,
        title: transcript.source_label ?? 'Clinical transcript',
        data: Buffer.from(transcript.transcript_text).toString('base64'),
      },
    }],
  }
}

function bundleEntry(resource: FhirResource) {
  return {
    fullUrl: `${resource.resourceType}/${resource.id ?? randomUUID()}`,
    resource,
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

  const [
    plans,
    problems,
    background,
    encounterRows,
    vitalsRows,
    labOrderRows,
    documentRows,
    transcriptRows,
  ] = await Promise.all([
    db.query.treatmentPlans.findMany({
      where: and(eq(treatmentPlans.tenant_id, tenantId), eq(treatmentPlans.patient_id, patientId)),
      with: {
        medications: {
          where: eq(medicationItems.is_active, true),
          orderBy: (m, { asc }) => asc(m.sort_order),
        },
      },
      orderBy: (p, { desc }) => desc(p.created_at),
    }),
    db.query.patientProblems.findMany({
      where: and(eq(patientProblems.tenant_id, tenantId), eq(patientProblems.patient_id, patientId)),
    }),
    db.query.patientBackground.findMany({
      where: and(eq(patientBackground.tenant_id, tenantId), eq(patientBackground.patient_id, patientId), eq(patientBackground.is_current, true)),
    }),
    db.query.encounters.findMany({
      where: and(eq(encounters.tenant_id, tenantId), eq(encounters.patient_id, patientId)),
    }),
    db.query.vitalSigns.findMany({
      where: and(eq(vitalSigns.tenant_id, tenantId), eq(vitalSigns.patient_id, patientId)),
    }),
    db.query.labOrders.findMany({
      where: and(eq(labOrders.tenant_id, tenantId), eq(labOrders.patient_id, patientId)),
      with: { results: { orderBy: (r, { asc }) => asc(r.sort_order) } },
    }),
    db.query.documents.findMany({
      where: and(eq(documents.tenant_id, tenantId), eq(documents.patient_id, patientId)),
    }),
    db.query.clinicalAudioTranscripts.findMany({
      where: and(eq(clinicalAudioTranscripts.tenant_id, tenantId), eq(clinicalAudioTranscripts.patient_id, patientId)),
    }),
  ])

  const medicationRequests = plans.flatMap(plan =>
    plan.medications.map(med =>
      buildFhirMedicationRequest(med, { start_date: plan.start_date, status: plan.status }, patientId),
    ),
  )
  const conditions = problems.map(buildFhirCondition)
  const allergies = background
    .filter(item => item.category === 'ALERGIAS')
    .map(buildFhirAllergy)
  const encounterResources = encounterRows.map(buildFhirEncounter)
  const vitalObservations = vitalsRows.flatMap(buildVitalObservations)
  const labOrdersWithResults = labOrderRows as LabOrderWithResults[]
  const labObservations = labOrdersWithResults.flatMap(order => order.results.map(result => buildLabObservation(order, result)))
  const diagnosticReports = labOrdersWithResults.map(buildDiagnosticReport)
  const documentReferences = documentRows.map(buildDocumentReference)
  const transcriptReferences = transcriptRows.map(buildTranscriptDocumentReference)

  const now = new Date().toISOString()
  const resources: FhirResource[] = [
    buildFhirPatient(patient),
    ...encounterResources,
    ...conditions,
    ...allergies,
    ...medicationRequests,
    ...vitalObservations,
    ...labObservations,
    ...diagnosticReports,
    ...documentReferences,
    ...transcriptReferences,
  ]

  return {
    resourceType: 'Bundle',
    id: randomUUID(),
    meta: { lastUpdated: now },
    type: 'collection',
    timestamp: now,
    entry: resources.map(bundleEntry),
  }
}
