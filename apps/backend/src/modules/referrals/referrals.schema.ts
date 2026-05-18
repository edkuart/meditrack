import { z } from 'zod'

export const CreateReferralSchema = z.object({
  to_doctor_id: z.string().uuid().optional(),
  to_department_id: z.string().uuid().optional(),
  encounter_id: z.string().uuid().optional(),
  reason: z.string().min(5).max(2000).trim(),
  notes: z.string().max(2000).trim().optional(),
  priority: z.enum(['ROUTINE', 'URGENT', 'EMERGENCY']).default('ROUTINE'),
}).refine(
  (d) => d.to_doctor_id || d.to_department_id,
  { message: 'Se requiere médico receptor o departamento destino' },
)

export const RespondReferralSchema = z.object({
  notes: z.string().max(2000).trim().optional(),
})

export const ListReferralsSchema = z.object({
  direction: z.enum(['incoming', 'outgoing', 'all']).default('all'),
})

export type CreateReferralInput = z.infer<typeof CreateReferralSchema>
export type RespondReferralInput = z.infer<typeof RespondReferralSchema>
