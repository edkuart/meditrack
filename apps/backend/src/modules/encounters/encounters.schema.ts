import { z } from 'zod'

const EncounterType = z.enum([
  'CONSULTATION',
  'FOLLOW_UP',
  'POST_HOSPITALIZATION',
  'DISCHARGE',
  'CHRONIC_CONTROL',
  'EMERGENCY',
])

export const CreateEncounterSchema = z.object({
  encounter_type: EncounterType.default('CONSULTATION'),
  chief_complaint: z.string().max(500).trim().optional(),
  notes: z.string().optional(),
})

export const UpdateEncounterSchema = z.object({
  notes: z.string().optional(),
  chief_complaint: z.string().max(500).trim().optional(),
  summary: z.string().optional(),
})

export const CloseEncounterSchema = z.object({
  summary: z.string().optional(),
  notes: z.string().optional(),
})

export type CreateEncounterInput = z.infer<typeof CreateEncounterSchema>
export type UpdateEncounterInput = z.infer<typeof UpdateEncounterSchema>
export type CloseEncounterInput = z.infer<typeof CloseEncounterSchema>
