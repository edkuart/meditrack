import { z } from 'zod'

export const BackgroundCategory = z.enum([
  'AHF',
  'APP',
  'APNP',
  'AQ',
  'ATRAUMA',
  'ALERGIAS',
  'GINECO_OBS',
  'MEDICAMENTOS',
  'PERINATAL',
])

export const UpsertBackgroundSchema = z.object({
  category: BackgroundCategory,
  content: z.string().min(1).trim(),
})

export type UpsertBackgroundInput = z.infer<typeof UpsertBackgroundSchema>
