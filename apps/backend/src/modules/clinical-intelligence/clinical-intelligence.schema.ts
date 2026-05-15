import { z } from 'zod'

export const ClinicalSourceType = z.enum([
  'MANUAL_ENTRY',
  'DOCUMENT_UPLOAD',
  'LAB_RESULT',
  'VITAL_SIGN',
  'ENCOUNTER_NOTE',
  'PATIENT_PORTAL',
  'AI_EXTRACTION',
  'EXTERNAL_RECORD',
  'AUDIO_TRANSCRIPT',
])

export const ClinicalReviewItemType = z.enum([
  'PATIENT_PROBLEM',
  'PATIENT_BACKGROUND',
  'VITAL_SIGNS',
  'LAB_RESULT',
  'ENCOUNTER_SOAP',
  'MEDICATION',
  'DOCUMENT_SUMMARY',
  'OTHER',
])

export const ClinicalReviewStatus = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED',
])

export const ClinicalReviewPriority = z.enum(['LOW', 'NORMAL', 'HIGH'])
export const DocumentProcessingMode = z.enum(['LOCAL_TRIAGE', 'EXTERNAL_AI', 'MANUAL_EXTRACTION'])
export const ClinicalTranscriptStatus = z.enum(['DRAFT', 'TRANSCRIBED', 'NEEDS_REVIEW', 'REVIEWED', 'ARCHIVED'])

const JsonObject = z.record(z.unknown())

export const CreateProvenanceSchema = z.object({
  encounter_id: z.string().uuid().optional(),
  document_id: z.string().uuid().optional(),
  source_type: ClinicalSourceType,
  source_resource_type: z.string().max(50).trim().optional(),
  source_resource_id: z.string().uuid().optional(),
  source_label: z.string().max(255).trim().optional(),
  source_excerpt: z.string().max(4000).optional(),
  source_checksum: z.string().length(64).regex(/^[a-f0-9]+$/i).optional(),
  target_resource_type: z.string().max(50).trim().optional(),
  target_resource_id: z.string().uuid().optional(),
  target_field: z.string().max(100).trim().optional(),
  extraction_method: z.string().max(80).trim().optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: JsonObject.default({}),
})

export const ListReviewItemsSchema = z.object({
  status: ClinicalReviewStatus.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export const CreateReviewItemSchema = z.object({
  encounter_id: z.string().uuid().optional(),
  document_id: z.string().uuid().optional(),
  provenance_id: z.string().uuid().optional(),
  item_type: ClinicalReviewItemType,
  priority: ClinicalReviewPriority.default('NORMAL'),
  title: z.string().min(1).max(200).trim(),
  summary: z.string().max(4000).optional(),
  proposed_payload: JsonObject.default({}),
  normalized_payload: JsonObject.default({}),
  confidence: z.number().min(0).max(1).optional(),
  reasoning: z.string().max(4000).optional(),
})

export const ResolveReviewItemSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'SUPERSEDED']),
  reviewer_notes: z.string().max(4000).optional(),
})

export const StartDocumentProcessingSchema = z.object({
  mode: DocumentProcessingMode.default('LOCAL_TRIAGE'),
  processor: z.string().max(100).trim().optional(),
})

const ExtractionFindingSchema = z.object({
  item_type: ClinicalReviewItemType.default('OTHER'),
  priority: ClinicalReviewPriority.default('NORMAL'),
  title: z.string().min(1).max(200).trim(),
  summary: z.string().max(4000).optional(),
  proposed_payload: JsonObject.default({}),
  normalized_payload: JsonObject.default({}),
  confidence: z.number().min(0).max(1).optional(),
  reasoning: z.string().max(4000).optional(),
  source_excerpt: z.string().max(4000).optional(),
})

export const SubmitDocumentExtractionSchema = z.object({
  job_id: z.string().uuid().optional(),
  processor: z.string().max(100).trim().default('manual-extraction-v1'),
  extracted_text: z.string().max(20000).optional(),
  extracted_payload: JsonObject.default({}),
  findings: z.array(ExtractionFindingSchema).max(50).default([]),
}).refine(
  data => Boolean(data.extracted_text?.trim()) || data.findings.length > 0 || Object.keys(data.extracted_payload).length > 0,
  { message: 'Extraction must include text, payload or findings' },
)

const TranscriptSegmentSchema = z.object({
  speaker: z.enum(['DOCTOR', 'PATIENT', 'CAREGIVER', 'STAFF', 'UNKNOWN']).default('UNKNOWN'),
  text: z.string().min(1).max(4000),
  start_seconds: z.number().min(0).optional(),
  end_seconds: z.number().min(0).optional(),
  confidence: z.number().min(0).max(1).optional(),
})

export const CreateClinicalTranscriptSchema = z.object({
  encounter_id: z.string().uuid().optional(),
  document_id: z.string().uuid().optional(),
  source_label: z.string().max(255).trim().optional(),
  language: z.string().min(2).max(20).default('es'),
  processor: z.string().max(100).trim().default('manual-transcript-v1'),
  transcript_text: z.string().min(12).max(30000),
  segments: z.array(TranscriptSegmentSchema).max(500).default([]),
  summary: z.string().max(4000).optional(),
  duration_seconds: z.number().int().positive().max(24 * 60 * 60).optional(),
  confidence: z.number().min(0).max(1).optional(),
  create_review_item: z.boolean().default(true),
})

export const ReviewClinicalTranscriptSchema = z.object({
  status: z.enum(['REVIEWED', 'ARCHIVED']),
  reviewer_notes: z.string().max(4000).optional(),
})

export type CreateProvenanceInput = z.infer<typeof CreateProvenanceSchema>
export type ListReviewItemsInput = z.infer<typeof ListReviewItemsSchema>
export type CreateReviewItemInput = z.infer<typeof CreateReviewItemSchema>
export type ResolveReviewItemInput = z.infer<typeof ResolveReviewItemSchema>
export type StartDocumentProcessingInput = z.infer<typeof StartDocumentProcessingSchema>
export type SubmitDocumentExtractionInput = z.infer<typeof SubmitDocumentExtractionSchema>
export type CreateClinicalTranscriptInput = z.infer<typeof CreateClinicalTranscriptSchema>
export type ReviewClinicalTranscriptInput = z.infer<typeof ReviewClinicalTranscriptSchema>
