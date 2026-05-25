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
  side_effects: z.array(z.string().min(1).max(80)).max(16).default([]),
  red_flags: z.array(z.string().min(1).max(100)).max(8).default([]),
  medication_issue: z.boolean().default(false),
  adherence_self_report: z.enum(['all', 'most', 'some', 'none']).nullable().optional(),
  adherence_skip_reason: z.string().max(200).nullable().optional(),
  energy_level: z.enum(['low', 'normal', 'high']).nullable().optional(),
  sleep_quality: z.enum(['poor', 'fair', 'good']).nullable().optional(),
  treatment_perception: z.enum(['better', 'same', 'worse']).nullable().optional(),
  mood: z.enum(['better', 'same', 'worse']).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
})

export type GenerateAccessInput = z.infer<typeof GenerateAccessSchema>
export type ValidateMagicLinkInput = z.infer<typeof ValidateMagicLinkSchema>
export type ValidatePinInput = z.infer<typeof ValidatePinSchema>
export type PatientCheckInInput = z.infer<typeof PatientCheckInSchema>
