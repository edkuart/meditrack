import { z } from 'zod'

const EncounterType = z.enum([
  'CONSULTATION',
  'FOLLOW_UP',
  'POST_HOSPITALIZATION',
  'DISCHARGE',
  'CHRONIC_CONTROL',
  'EMERGENCY',
])

export const EncounterWorkflowStage = z.enum([
  'INTAKE',
  'ROOMING',
  'SUBJECTIVE',
  'OBJECTIVE',
  'ASSESSMENT',
  'PLAN',
  'ORDERS',
  'READY_TO_CLOSE',
])

const SoapFields = {
  subjective: z.string().optional(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
}

export const CreateEncounterSchema = z.object({
  encounter_type: EncounterType.default('CONSULTATION'),
  chief_complaint: z.string().max(500).trim().optional(),
  notes: z.string().optional(),
  workflow_stage: EncounterWorkflowStage.default('SUBJECTIVE'),
  ...SoapFields,
})

export const UpdateEncounterSchema = z.object({
  chief_complaint: z.string().max(500).trim().optional(),
  notes: z.string().optional(),
  summary: z.string().optional(),
  workflow_stage: EncounterWorkflowStage.optional(),
  ...SoapFields,
})

export const CloseEncounterSchema = z.object({
  summary: z.string().optional(),
  notes: z.string().optional(),
  ...SoapFields,
})

export type CreateEncounterInput = z.infer<typeof CreateEncounterSchema>
export type UpdateEncounterInput = z.infer<typeof UpdateEncounterSchema>
export type CloseEncounterInput = z.infer<typeof CloseEncounterSchema>
