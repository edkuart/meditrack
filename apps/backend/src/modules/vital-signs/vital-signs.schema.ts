import { z } from 'zod'

export const CreateVitalSignsSchema = z.object({
  blood_pressure_systolic: z.number().int().min(50).max(300).optional(),
  blood_pressure_diastolic: z.number().int().min(20).max(200).optional(),
  heart_rate: z.number().int().min(20).max(300).optional(),
  respiratory_rate: z.number().int().min(4).max(60).optional(),
  temperature_celsius: z.number().min(30).max(45).optional(),
  weight_kg: z.number().min(0.1).max(500).optional(),
  height_cm: z.number().min(20).max(300).optional(),
  oxygen_saturation: z.number().int().min(50).max(100).optional(),
  glucose_mg_dl: z.number().int().min(20).max(1000).optional(),
})

export type CreateVitalSignsInput = z.infer<typeof CreateVitalSignsSchema>
