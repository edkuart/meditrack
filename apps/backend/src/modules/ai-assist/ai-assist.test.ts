import { describe, expect, it } from 'vitest'
import { buildAiAssistDraft, isSafeAiAssistMode } from './ai-assist.engine.ts'

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
