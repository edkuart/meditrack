import { describe, expect, it } from 'vitest'
import {
  CreateProvenanceSchema,
  CreateClinicalTranscriptSchema,
  CreateReviewItemSchema,
  ReviewClinicalTranscriptSchema,
  ResolveReviewItemSchema,
  StartDocumentProcessingSchema,
  SubmitDocumentExtractionSchema,
} from './clinical-intelligence.schema.ts'

describe('clinical intelligence schemas', () => {
  it('accepts document provenance with confidence and metadata', () => {
    const parsed = CreateProvenanceSchema.parse({
      source_type: 'DOCUMENT_UPLOAD',
      document_id: '11111111-1111-4111-8111-111111111111',
      source_label: 'laboratorio.pdf',
      source_checksum: 'a'.repeat(64),
      target_resource_type: 'DOCUMENT',
      confidence: 0.82,
      metadata: { page_count: 2 },
    })

    expect(parsed.source_type).toBe('DOCUMENT_UPLOAD')
    expect(parsed.metadata).toEqual({ page_count: 2 })
  })

  it('rejects impossible confidence values', () => {
    expect(() => CreateReviewItemSchema.parse({
      item_type: 'LAB_RESULT',
      title: 'Hemoglobina detectada',
      confidence: 1.2,
    })).toThrow()
  })

  it('only allows terminal review decisions when resolving', () => {
    expect(ResolveReviewItemSchema.parse({ status: 'APPROVED' }).status).toBe('APPROVED')
    expect(() => ResolveReviewItemSchema.parse({ status: 'PENDING' })).toThrow()
  })

  it('defaults document processing to local triage', () => {
    const parsed = StartDocumentProcessingSchema.parse({})

    expect(parsed.mode).toBe('LOCAL_TRIAGE')
  })

  it('requires document extraction submissions to include useful content', () => {
    expect(() => SubmitDocumentExtractionSchema.parse({})).toThrow()

    const parsed = SubmitDocumentExtractionSchema.parse({
      processor: 'ocr-test-v1',
      findings: [{
        item_type: 'LAB_RESULT',
        title: 'Hemoglobina',
        confidence: 0.7,
        proposed_payload: { value: '12.1 g/dL' },
      }],
    })

    expect(parsed.findings).toHaveLength(1)
    expect(parsed.findings[0].priority).toBe('NORMAL')
  })

  it('accepts clinical transcripts with speaker segments', () => {
    const parsed = CreateClinicalTranscriptSchema.parse({
      transcript_text: 'Doctor: ¿Cómo se ha sentido? Paciente: He tenido dolor de cabeza leve desde ayer.',
      segments: [
        { speaker: 'DOCTOR', text: '¿Cómo se ha sentido?', start_seconds: 0 },
        { speaker: 'PATIENT', text: 'He tenido dolor de cabeza leve desde ayer.', start_seconds: 2.4 },
      ],
      confidence: 0.86,
    })

    expect(parsed.language).toBe('es')
    expect(parsed.create_review_item).toBe(true)
    expect(parsed.segments[1].speaker).toBe('PATIENT')
  })

  it('only allows reviewed or archived transcript review states', () => {
    expect(ReviewClinicalTranscriptSchema.parse({ status: 'REVIEWED' }).status).toBe('REVIEWED')
    expect(() => ReviewClinicalTranscriptSchema.parse({ status: 'NEEDS_REVIEW' })).toThrow()
  })
})
