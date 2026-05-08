import { z } from 'zod'

export const FrequencyType = {
  DAILY: 'DAILY',
  EVERY_X_HOURS: 'EVERY_X_HOURS',
  WEEKLY: 'WEEKLY',
  AS_NEEDED: 'AS_NEEDED',
} as const

export type FrequencyType = (typeof FrequencyType)[keyof typeof FrequencyType]

export const DoseStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  MISSED: 'MISSED',
  SKIPPED: 'SKIPPED',
  CANCELLED: 'CANCELLED',
} as const

export type DoseStatus = (typeof DoseStatus)[keyof typeof DoseStatus]

export const MedicationItemSchema = z.object({
  drug_name: z.string().min(1).max(200),
  presentation: z.string().max(100).optional(),
  concentration: z.string().max(50).optional(),
  dose_amount: z.number().positive(),
  dose_unit: z.string().max(30),
  route: z.string().max(50).optional(),
  frequency_type: z.nativeEnum(FrequencyType),
  frequency_value: z.number().positive().optional(),
  times_per_day: z.array(z.string()).optional(),
  duration_days: z.number().int().positive().optional(),
  special_instructions: z.string().max(500).optional(),
  with_food: z.boolean().default(false),
  sort_order: z.number().int().default(0),
})

export const CreateTreatmentSchema = z.object({
  encounter_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  start_date: z.string().date(),
  instructions: z.string().optional(),
  medications: z.array(MedicationItemSchema).min(1),
})

export type MedicationItemInput = z.infer<typeof MedicationItemSchema>
export type CreateTreatmentInput = z.infer<typeof CreateTreatmentSchema>
