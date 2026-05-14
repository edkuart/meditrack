import { z } from 'zod'

export const AiUsageFeature = z.enum([
  'ENCOUNTER_SUMMARY',
  'PATIENT_SIMPLIFICATION',
  'CLINICAL_COPILOT',
  'DOCUMENT_EXTRACTION',
  'TRANSCRIPTION',
  'OTHER',
])

export const RecordAiUsageSchema = z.object({
  patient_id: z.string().uuid().optional(),
  encounter_id: z.string().uuid().optional(),
  feature: AiUsageFeature,
  provider: z.string().max(80).default('local'),
  model: z.string().min(1).max(120),
  units: z.number().int().positive().max(1000).default(1),
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  estimated_cost_cents: z.number().int().nonnegative().default(0),
  resource_type: z.string().max(50).optional(),
  resource_id: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).default({}),
})

export type AiUsageFeatureInput = z.infer<typeof AiUsageFeature>
export type RecordAiUsageInput = z.input<typeof RecordAiUsageSchema>
