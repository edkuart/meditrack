import { z } from 'zod'

export const EncounterType = {
  CONSULTATION: 'CONSULTATION',
  FOLLOW_UP: 'FOLLOW_UP',
  POST_HOSPITALIZATION: 'POST_HOSPITALIZATION',
  DISCHARGE: 'DISCHARGE',
  CHRONIC_CONTROL: 'CHRONIC_CONTROL',
  EMERGENCY: 'EMERGENCY',
} as const

export type EncounterType = (typeof EncounterType)[keyof typeof EncounterType]

export const EncounterStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED',
} as const

export type EncounterStatus = (typeof EncounterStatus)[keyof typeof EncounterStatus]

export const CreateEncounterSchema = z.object({
  patient_id: z.string().uuid(),
  encounter_type: z.nativeEnum(EncounterType),
  chief_complaint: z.string().max(500).optional(),
  notes: z.string().optional(),
})

export type CreateEncounterInput = z.infer<typeof CreateEncounterSchema>
