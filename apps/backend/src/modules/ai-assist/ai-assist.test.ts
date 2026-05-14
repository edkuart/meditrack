import { describe, expect, it } from 'vitest'
import { buildAiAssistDraft, buildClinicalCopilotDraft, isSafeAiAssistMode } from './ai-assist.engine.ts'

describe('AI assist guardrails', () => {
  it('only allows non-prescriptive assist modes', () => {
    expect(isSafeAiAssistMode('SUMMARIZE_ENCOUNTER')).toBe(true)
    expect(isSafeAiAssistMode('SIMPLIFY_FOR_PATIENT')).toBe(true)
    expect(isSafeAiAssistMode('DIAGNOSE_PATIENT')).toBe(false)
    expect(isSafeAiAssistMode('PRESCRIBE_TREATMENT')).toBe(false)
  })

  it('summarizes clinical text as a reviewable draft', () => {
    const draft = buildAiAssistDraft(
      'SUMMARIZE_ENCOUNTER',
      'Paciente refiere buena adherencia. Niega eventos adversos. Se revisan signos de alarma.',
    )

    expect(draft.text).toContain('Resumen asistido')
    expect(draft.safety_notice).toContain('No genera diagnósticos')
    expect(draft.model).toBe('local-assist-v1')
  })

  it('simplifies clinical language without adding medical instructions', () => {
    const draft = buildAiAssistDraft(
      'SIMPLIFY_FOR_PATIENT',
      'Se revisa adherencia y eventos adversos. Paciente refiere cefalea ocasional.',
    )

    expect(draft.text).toContain('cumplimiento del tratamiento')
    expect(draft.text).toContain('dolor de cabeza')
    expect(draft.text).toContain('indicaciones confirmadas')
  })
})

describe('clinical copilot local engine', () => {
  const baseSummary = {
    patient: {
      first_name: 'Carlos',
      last_name: 'Méndez',
      date_of_birth: '1980-02-10',
      sex: 'male',
      notes: null,
    },
    problems: [
      { title: 'Hipertensión arterial', status: 'CHRONIC', icd10_code: 'I10', notes: null },
    ],
    background: [
      { category: 'APP', content: 'Hipertensión desde hace 3 años.' },
      { category: 'MEDICAMENTOS', content: 'Losartán referido por paciente.' },
    ],
    latest_encounters: [{
      chief_complaint: 'Control de presión arterial',
      subjective: null,
      objective: null,
      assessment: null,
      plan: null,
      summary: null,
    }],
    latest_vitals: [{
      blood_pressure_systolic: 148,
      blood_pressure_diastolic: 94,
      heart_rate: 82,
      temperature_celsius: '36.7',
      oxygen_saturation: 98,
      recorded_at: new Date('2026-05-14T10:00:00Z'),
    }],
    latest_labs: [],
    treatments: [{
      name: 'Control hipertensión',
      status: 'ACTIVE',
      medications: [{ drug_name: 'Losartán', dose_amount: 50, dose_unit: 'mg', frequency_type: 'DAILY' }],
      interventions: [],
    }],
    pending_review_items: [],
  }

  it('prepares consultation questions from structured problems', () => {
    const draft = buildClinicalCopilotDraft('SUGGEST_PATIENT_QUESTIONS', baseSummary)

    expect(draft.model).toBe('meditrack-copilot-local-v1')
    expect(draft.suggested_questions.join('\n')).toContain('presión')
    expect(draft.soft_alerts.join('\n')).toContain('presión')
    expect(draft.safety_notice).toContain('médico debe revisar')
  })

  it('flags missing structured allergies as a clinical gap', () => {
    const draft = buildClinicalCopilotDraft('REVIEW_CLINICAL_GAPS', baseSummary)

    expect(draft.clinical_gaps).toContain('Alergias no documentadas de forma estructurada.')
  })

  it('creates a reviewable SOAP draft', () => {
    const draft = buildClinicalCopilotDraft('DRAFT_SOAP', baseSummary, 'Paciente refiere cefalea leve ocasional.')

    expect(draft.soap_draft?.subjective).toContain('cefalea')
    expect(draft.soap_draft?.objective).toContain('PA 148/94')
    expect(draft.soap_draft?.plan).toContain('Completar plan')
  })
})
