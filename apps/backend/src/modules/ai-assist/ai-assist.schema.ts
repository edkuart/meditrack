import { z } from 'zod'

export const EncounterAiAssistSchema = z.object({
  mode: z.enum(['SUMMARIZE_ENCOUNTER', 'SIMPLIFY_FOR_PATIENT']),
  source_text: z.string().max(6000).optional(),
})

export const ClinicalCopilotMode = z.enum([
  'ASK_CLINICAL_QUESTION',
  'PREPARE_CONSULTATION',
  'SUGGEST_PATIENT_QUESTIONS',
  'DRAFT_SOAP',
  'REVIEW_CLINICAL_GAPS',
])

export const ClinicalCopilotSchema = z.object({
  mode: ClinicalCopilotMode,
  model_tier: z.enum(['standard', 'premium']).default('standard'),
  question: z.string().min(3).max(1200).optional(),
  encounter_id: z.string().uuid().optional(),
  source_text: z.string().max(8000).optional(),
  save_to_review_queue: z.boolean().default(false),
}).refine(
  data => data.mode !== 'ASK_CLINICAL_QUESTION' || Boolean(data.question?.trim()),
  { message: 'question is required for ASK_CLINICAL_QUESTION', path: ['question'] },
)

export type EncounterAiAssistInput = z.infer<typeof EncounterAiAssistSchema>
export type ClinicalCopilotInput = z.infer<typeof ClinicalCopilotSchema>
