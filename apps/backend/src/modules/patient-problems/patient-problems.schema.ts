import { z } from 'zod'

export const ProblemStatus = z.enum(['ACTIVE', 'INACTIVE', 'RESOLVED', 'CHRONIC'])

export const CreateProblemSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().optional(),
  icd10_code: z.string().max(10).trim().optional(),
  icd10_description: z.string().max(255).optional(),
  status: ProblemStatus.default('ACTIVE'),
  onset_date: z.string().date().optional(),
  notes: z.string().optional(),
  identified_in_encounter_id: z.string().uuid().optional(),
})

export const UpdateProblemSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().optional(),
  icd10_code: z.string().max(10).trim().optional(),
  icd10_description: z.string().max(255).optional(),
  status: ProblemStatus.optional(),
  onset_date: z.string().date().optional(),
  resolved_date: z.string().date().optional(),
  notes: z.string().optional(),
})

export type CreateProblemInput = z.infer<typeof CreateProblemSchema>
export type UpdateProblemInput = z.infer<typeof UpdateProblemSchema>
