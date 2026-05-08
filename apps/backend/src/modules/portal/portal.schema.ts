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

export type GenerateAccessInput = z.infer<typeof GenerateAccessSchema>
export type ValidateMagicLinkInput = z.infer<typeof ValidateMagicLinkSchema>
export type ValidatePinInput = z.infer<typeof ValidatePinSchema>
