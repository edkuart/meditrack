import { eq, and, desc } from 'drizzle-orm'
import { db, vitalSigns, encounters, patients } from '../../shared/db/index.ts'
import { NotFoundError } from '../../shared/errors.ts'
import type { CreatePatientVitalSignsInput, CreateVitalSignsInput } from './vital-signs.schema.ts'

export async function recordVitalSigns(
  tenantId: string,
  encounterId: string,
  actorId: string,
  input: CreateVitalSignsInput,
) {
  const encounter = await db.query.encounters.findFirst({
    where: and(eq(encounters.tenant_id, tenantId), eq(encounters.id, encounterId)),
    columns: { id: true, patient_id: true, status: true },
  })
  if (!encounter) throw new NotFoundError('Encounter')

  const [record] = await db
    .insert(vitalSigns)
    .values({
      tenant_id: tenantId,
      patient_id: encounter.patient_id,
      encounter_id: encounterId,
      recorded_by: actorId,
      blood_pressure_systolic: input.blood_pressure_systolic,
      blood_pressure_diastolic: input.blood_pressure_diastolic,
      heart_rate: input.heart_rate,
      respiratory_rate: input.respiratory_rate,
      temperature_celsius: input.temperature_celsius?.toFixed(1),
      weight_kg: input.weight_kg?.toFixed(2),
      height_cm: input.height_cm?.toFixed(1),
      oxygen_saturation: input.oxygen_saturation,
      glucose_mg_dl: input.glucose_mg_dl,
      recorded_at: input.recorded_at,
    })
    .returning()

  return record
}

export async function recordPatientVitalSigns(
  tenantId: string,
  patientId: string,
  actorId: string,
  input: CreatePatientVitalSignsInput,
) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  let encounterId: string | undefined
  if (input.encounter_id) {
    const encounter = await db.query.encounters.findFirst({
      where: and(
        eq(encounters.tenant_id, tenantId),
        eq(encounters.patient_id, patientId),
        eq(encounters.id, input.encounter_id),
      ),
      columns: { id: true },
    })
    if (!encounter) throw new NotFoundError('Encounter')
    encounterId = encounter.id
  }

  const [record] = await db
    .insert(vitalSigns)
    .values({
      tenant_id: tenantId,
      patient_id: patientId,
      encounter_id: encounterId,
      recorded_by: actorId,
      blood_pressure_systolic: input.blood_pressure_systolic,
      blood_pressure_diastolic: input.blood_pressure_diastolic,
      heart_rate: input.heart_rate,
      respiratory_rate: input.respiratory_rate,
      temperature_celsius: input.temperature_celsius?.toFixed(1),
      weight_kg: input.weight_kg?.toFixed(2),
      height_cm: input.height_cm?.toFixed(1),
      oxygen_saturation: input.oxygen_saturation,
      glucose_mg_dl: input.glucose_mg_dl,
      recorded_at: input.recorded_at,
    })
    .returning()

  return record
}

export async function getEncounterVitalSigns(tenantId: string, encounterId: string) {
  const encounter = await db.query.encounters.findFirst({
    where: and(eq(encounters.tenant_id, tenantId), eq(encounters.id, encounterId)),
    columns: { id: true },
  })
  if (!encounter) throw new NotFoundError('Encounter')

  return db
    .select()
    .from(vitalSigns)
    .where(and(eq(vitalSigns.tenant_id, tenantId), eq(vitalSigns.encounter_id, encounterId)))
    .orderBy(desc(vitalSigns.recorded_at))
}

export async function getPatientVitalHistory(tenantId: string, patientId: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  return db
    .select()
    .from(vitalSigns)
    .where(and(eq(vitalSigns.tenant_id, tenantId), eq(vitalSigns.patient_id, patientId)))
    .orderBy(desc(vitalSigns.recorded_at))
    .limit(100)
}
