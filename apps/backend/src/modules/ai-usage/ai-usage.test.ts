import { describe, expect, it } from 'vitest'
import { RecordAiUsageSchema } from './ai-usage.schema.ts'
import { aiFeatureFromAssistMode } from './ai-usage.service.ts'

describe('ai usage contract', () => {
  it('applies safe defaults when recording usage', () => {
    const parsed = RecordAiUsageSchema.parse({
      feature: 'CLINICAL_COPILOT',
      model: 'local-clinical-rules-v1',
    })

    expect(parsed.provider).toBe('local')
    expect(parsed.units).toBe(1)
    expect(parsed.estimated_cost_cents).toBe(0)
    expect(parsed.metadata).toEqual({})
  })

  it('requires positive usage units', () => {
    const parsed = RecordAiUsageSchema.safeParse({
      feature: 'DOCUMENT_EXTRACTION',
      model: 'ocr-v1',
      units: 0,
    })

    expect(parsed.success).toBe(false)
  })

  it('maps assistant modes to billable features', () => {
    expect(aiFeatureFromAssistMode('SUMMARIZE_ENCOUNTER')).toBe('ENCOUNTER_SUMMARY')
    expect(aiFeatureFromAssistMode('SIMPLIFY_FOR_PATIENT')).toBe('PATIENT_SIMPLIFICATION')
    expect(aiFeatureFromAssistMode('DRAFT_SOAP')).toBe('CLINICAL_COPILOT')
    expect(aiFeatureFromAssistMode('UNKNOWN_MODE')).toBe('OTHER')
  })
})
