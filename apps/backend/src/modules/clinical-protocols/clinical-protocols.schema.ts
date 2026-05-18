import { z } from 'zod'

export const ListClinicalProtocolsQuerySchema = z.object({
  category: z.string().min(1).max(80).trim().optional(),
  q: z.string().min(1).max(100).trim().optional(),
})

export type ListClinicalProtocolsQuery = z.infer<typeof ListClinicalProtocolsQuerySchema>

const MedicationSchema = z.object({
  drug_name: z.string().min(1),
  presentation: z.string().optional(),
  concentration: z.string().optional(),
  dose_amount: z.number().positive(),
  dose_unit: z.string().min(1),
  route: z.string().optional(),
  frequency_type: z.enum(['DAILY', 'EVERY_X_HOURS', 'WEEKLY', 'AS_NEEDED']),
  frequency_value: z.number().int().positive().optional(),
  times_per_day: z.array(z.string()).optional(),
  duration_days: z.number().int().positive().optional(),
  special_instructions: z.string().optional(),
  with_food: z.boolean().optional(),
  sort_order: z.number().int().optional(),
})

export const CreateProtocolSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(80).default('GENERAL'),
  description: z.string().max(2000).optional(),
  encounter_type: z.enum(['CONSULTATION', 'FOLLOW_UP', 'POST_HOSPITALIZATION', 'DISCHARGE', 'CHRONIC_CONTROL', 'EMERGENCY']).optional(),
  note_template: z.string().max(5000).optional(),
  summary_template: z.string().max(5000).optional(),
  treatment_name: z.string().max(200).optional(),
  treatment_instructions: z.string().max(2000).optional(),
  medications: z.array(MedicationSchema).default([]),
  follow_up_days: z.number().int().positive().optional(),
  tags: z.array(z.string().max(50)).default([]),
})

export const UpdateProtocolSchema = CreateProtocolSchema.partial()

export type CreateProtocolInput = z.infer<typeof CreateProtocolSchema>
export type UpdateProtocolInput = z.infer<typeof UpdateProtocolSchema>
