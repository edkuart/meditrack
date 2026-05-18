import { describe, expect, it } from 'vitest'
import { buildDoseText, buildFhirMedicationRequest, buildFhirPatient, toFhirGender } from './fhir.service.ts'

describe('FHIR resource builders', () => {
  it('maps MediTrack sex values to FHIR gender values', () => {
    expect(toFhirGender('male')).toBe('male')
    expect(toFhirGender('female')).toBe('female')
    expect(toFhirGender('other')).toBe('other')
    expect(toFhirGender(null)).toBe('unknown')
  })

  it('builds a FHIR Patient resource with identifiers and telecom', () => {
    const patient = {
      id: 'patient-1',
      tenant_id: 'tenant-1',
      first_name: 'Ana',
      last_name: 'Pérez',
      date_of_birth: '1990-01-15',
      sex: 'female' as const,
      phone: '+50255555555',
      email: 'ana@example.com',
      id_number: '123456',
      mrn: null,
      access_pin_hash: null,
      emergency_contact: null,
      tags: [],
      notes: null,
      is_active: true,
      anonymized_at: null,
      created_by: null,
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-02T00:00:00Z'),
    }

    const resource = buildFhirPatient(patient)

    expect(resource.resourceType).toBe('Patient')
    expect(resource.gender).toBe('female')
    expect(resource.birthDate).toBe('1990-01-15')
    expect(resource.identifier).toEqual(expect.arrayContaining([
      expect.objectContaining({ system: 'urn:meditrack:id_number', value: '123456' }),
    ]))
  })

  it('builds MedicationRequest dosage text without adding clinical instructions', () => {
    const med = {
      id: 'med-1',
      treatment_plan_id: 'plan-1',
      drug_name: 'Losartán',
      presentation: 'tableta',
      concentration: '50 mg',
      dose_amount: 1,
      dose_unit: 'tableta(s)',
      route: 'oral',
      frequency_type: 'DAILY' as const,
      frequency_value: null,
      times_per_day: ['08:00'],
      duration_days: 30,
      special_instructions: 'Tomar a la misma hora.',
      with_food: false,
      is_active: true,
      sort_order: 0,
      created_at: new Date('2026-01-01T00:00:00Z'),
    }

    expect(buildDoseText(med)).toContain('Losartán')

    const resource = buildFhirMedicationRequest(med, { start_date: '2026-05-14', status: 'ACTIVE' }, 'patient-1')

    expect(resource.resourceType).toBe('MedicationRequest')
    expect(resource.status).toBe('active')
    expect(resource.subject).toEqual({ reference: 'Patient/patient-1' })
  })
})
