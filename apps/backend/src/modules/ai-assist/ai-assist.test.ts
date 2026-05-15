import { describe, expect, it } from 'vitest'
import { buildAiAssistDraft, buildClinicalCopilotDraft, isSafeAiAssistMode } from './ai-assist.engine.ts'
import { cleanClinicalCopilotDraft } from './ai-provider.service.ts'

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
      respiratory_rate: 16,
      temperature_celsius: '36.7',
      weight_kg: '82.00',
      height_cm: '172.0',
      oxygen_saturation: 98,
      glucose_mg_dl: 105,
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

  it('keeps generic validation notices out of clinical alerts', () => {
    const draft = buildClinicalCopilotDraft('ASK_CLINICAL_QUESTION', baseSummary, undefined, '¿Qué reviso primero?')
    const cleaned = cleanClinicalCopilotDraft({
      ...draft,
      answer: [
        'Riesgos inmediatos:',
        '- PA elevada con cefalea.',
        'Preguntas clave:',
        '- ¿Trajo lista completa de medicamentos y dosis?',
        'Siguiente paso seguro:',
        '- Revisar signos vitales; requiere validación médica.',
      ].join('\n'),
      soft_alerts: [
        'PA 182/110 con cefalea: confirmar síntomas de daño agudo y necesidad de valoración presencial.',
        'Recordar que las recomendaciones requieren validación y juicio clínico del médico.',
        'TSH 12.6 mIU/L por mala adherencia a levotiroxina: contribuye a fatiga y edema.',
      ],
      suggested_questions: [
        '¿Trajo lista completa de medicamentos y dosis?',
        '¿Ha omitido dosis esta semana?',
      ],
      clinical_gaps: [
        'Registro domiciliario reciente de PA no documentado.',
        '¿Ha omitido dosis esta semana?',
      ],
    })

    expect(cleaned.soft_alerts).toEqual([
      'PA 182/110 con cefalea: confirmar síntomas de daño agudo y necesidad de valoración presencial.',
    ])
    expect(cleaned.answer).not.toContain('requiere validación médica')
    expect(cleaned.suggested_questions).toEqual(['¿Ha omitido dosis esta semana?'])
    expect(cleaned.clinical_gaps).toEqual(['Registro domiciliario reciente de PA no documentado.'])
  })

  it('prioritizes borderline biometrics when paired with symptoms and anemia context', () => {
    const draft = buildClinicalCopilotDraft('ASK_CLINICAL_QUESTION', {
      ...baseSummary,
      patient: {
        ...baseSummary.patient,
        first_name: 'Lucia',
        last_name: 'Gomez',
        sex: 'female',
      },
      problems: [
        { title: 'Anemia microcitica probable ferropenica', status: 'ACTIVE', icd10_code: 'D50.9', notes: 'Fatiga, palpitaciones y sangrado uterino persistente.' },
        { title: 'Edema y ganancia de peso reciente en estudio', status: 'ACTIVE', icd10_code: 'R60.9', notes: 'Disnea de esfuerzo y SpO2 93-95%.' },
      ],
      latest_vitals: [{
        blood_pressure_systolic: 142,
        blood_pressure_diastolic: 88,
        heart_rate: 102,
        respiratory_rate: 20,
        temperature_celsius: null,
        weight_kg: '85.10',
        height_cm: '158.0',
        oxygen_saturation: 93,
        glucose_mg_dl: 128,
        recorded_at: new Date('2026-05-15T07:30:00Z'),
      }],
      latest_labs: [{
        status: 'COMPLETED',
        notes: null,
        results: [
          { panel_name: 'Hematologia', parameter_name: 'Hemoglobina', value: '9.8', numeric_value: '9.8', unit: 'g/dL', status: 'LOW' },
        ],
      }],
    }, undefined, '¿Necesita evaluación presencial urgente o seguimiento ambulatorio?')

    expect(draft.soft_alerts.join('\n')).toContain('SpO2 92-94%')
    expect(draft.soft_alerts.join('\n')).toContain('Taquicardia')
    expect(draft.soft_alerts.join('\n')).toContain('Hemoglobina baja')
  })

  it('removes important but non-priority thyroid findings from soft alerts', () => {
    const draft = buildClinicalCopilotDraft('ASK_CLINICAL_QUESTION', baseSummary, undefined, '¿Qué reviso primero?')
    const cleaned = cleanClinicalCopilotDraft({
      ...draft,
      soft_alerts: [
        'TSH 12.6 mIU/L por mala adherencia a levotiroxina: contribuye a fatiga, aumento de peso y edema.',
        'SpO2 93-95% con disnea y edema: confirmar deterioro respiratorio/cardiopulmonar.',
      ],
    })

    expect(cleaned.soft_alerts).toEqual([
      'SpO2 93-95% con disnea y edema: confirmar deterioro respiratorio/cardiopulmonar.',
    ])
  })
})
