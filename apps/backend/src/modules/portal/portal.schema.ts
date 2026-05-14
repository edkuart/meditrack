import { z } from 'zod'

export const GenerateAccessSchema = z.object({
  channel: z.enum(['magic_link', 'qr', 'pin', 'whatsapp']),
  expires_in_days: z.number().int().min(1).max(365).default(90),
})

export const ValidateMagicLinkSchema = z.object({
  token: z.string().min(1),
})

export const ValidatePinSchema = z.object({
  patient_id: z.string().uuid(),
  pin: z.string().length(6).regex(/^\d{6}$/),
})

export const PatientCheckInSchema = z.object({
  pain_score: z.number().int().min(0).max(10).nullable().optional(),
  temperature_c: z.number().min(30).max(45).nullable().optional(),
  symptoms: z.array(z.string().min(1).max(80)).max(12).default([]),
  red_flags: z.array(z.string().min(1).max(100)).max(8).default([]),
  medication_issue: z.boolean().default(false),
  mood: z.enum(['better', 'same', 'worse']).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export type GenerateAccessInput = z.infer<typeof GenerateAccessSchema>
export type ValidateMagicLinkInput = z.infer<typeof ValidateMagicLinkSchema>
export type ValidatePinInput = z.infer<typeof ValidatePinSchema>
export type PatientCheckInInput = z.infer<typeof PatientCheckInSchema>
