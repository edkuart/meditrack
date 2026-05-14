import { z } from 'zod'

export const EncounterAiAssistSchema = z.object({
  mode: z.enum(['SUMMARIZE_ENCOUNTER', 'SIMPLIFY_FOR_PATIENT']),
  source_text: z.string().max(6000).optional(),
})

export const ClinicalCopilotMode = z.enum([
  'PREPARE_CONSULTATION',
  'SUGGEST_PATIENT_QUESTIONS',
  'DRAFT_SOAP',
  'REVIEW_CLINICAL_GAPS',
])

export const ClinicalCopilotSchema = z.object({
  mode: ClinicalCopilotMode,
  encounter_id: z.string().uuid().optional(),
  source_text: z.string().max(8000).optional(),
  save_to_review_queue: z.boolean().default(false),
})

export type EncounterAiAssistInput = z.infer<typeof EncounterAiAssistSchema>
export type ClinicalCopilotInput = z.infer<typeof ClinicalCopilotSchema>
