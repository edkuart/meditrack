import { z } from 'zod'

export const EncounterAiAssistSchema = z.object({
  mode: z.enum(['SUMMARIZE_ENCOUNTER', 'SIMPLIFY_FOR_PATIENT']),
  source_text: z.string().max(6000).optional(),
})

export type EncounterAiAssistInput = z.infer<typeof EncounterAiAssistSchema>
