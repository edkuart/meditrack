import { z } from 'zod'

const FrequencyType = z.enum(['DAILY', 'EVERY_X_HOURS', 'WEEKLY', 'AS_NEEDED'])

export const InterventionTypeEnum = z.enum(['EXERCISE', 'DIET', 'THERAPY', 'MONITORING', 'OTHER'])

export const InterventionItemSchema = z.object({
  type:         InterventionTypeEnum.default('OTHER'),
  title:        z.string().min(1).max(200).trim(),
  description:  z.string().max(1000).optional(),
  frequency:    z.string().max(100).trim().optional(),
  duration:     z.string().max(50).trim().optional(),
  instructions: z.string().max(1000).optional(),
  sort_order:   z.number().int().default(0),
})

export const MedicationItemSchema = z.object({
  drug_name: z.string().min(1).max(200).trim(),
  presentation: z.string().max(100).trim().optional(),
  concentration: z.string().max(50).trim().optional(),
  dose_amount: z.number().positive(),
  dose_unit: z.string().max(30).trim(),
  route: z.string().max(50).trim().optional(),
  frequency_type: FrequencyType,
  // Required for EVERY_X_HOURS: interval in hours (e.g. 8 = every 8h)
  frequency_value: z.number().int().positive().optional(),
  // Required for DAILY: times in HH:MM format e.g. ["08:00", "20:00"]
  times_per_day: z.array(z.string().regex(/^\d{2}:\d{2}$/)).optional(),
  // Required for WEEKLY: days 0=Sun...6=Sat + time e.g. [[1,"08:00"],[4,"08:00"]]
  duration_days: z.number().int().positive().optional(),
  special_instructions: z.string().max(500).optional(),
  with_food: z.boolean().default(false),
  sort_order: z.number().int().default(0),
})

export const CreateTreatmentSchema = z.object({
  name:          z.string().min(1).max(200).trim(),
  start_date:    z.string().date(),
  instructions:  z.string().optional(),
  medications:   z.array(MedicationItemSchema).max(20).default([]),
  interventions: z.array(InterventionItemSchema).max(20).default([]),
}).refine(
  d => d.medications.length > 0 || d.interventions.length > 0,
  { message: 'El plan debe incluir al menos un medicamento o una intervención.' },
)

export const UpdateInterventionSchema = z.object({
  type:         InterventionTypeEnum.optional(),
  title:        z.string().min(1).max(200).trim().optional(),
  description:  z.string().max(1000).optional(),
  frequency:    z.string().max(100).trim().optional(),
  duration:     z.string().max(50).trim().optional(),
  instructions: z.string().max(1000).optional(),
})

export const ConfirmDoseSchema = z.object({
  notes: z.string().max(300).optional(),
})

export type MedicationItemInput    = z.infer<typeof MedicationItemSchema>
export type InterventionItemInput  = z.infer<typeof InterventionItemSchema>
export type CreateTreatmentInput   = z.infer<typeof CreateTreatmentSchema>
export type UpdateInterventionInput = z.infer<typeof UpdateInterventionSchema>
export type ConfirmDoseInput        = z.infer<typeof ConfirmDoseSchema>
