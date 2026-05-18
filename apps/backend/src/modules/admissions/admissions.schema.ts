import { z } from 'zod'

export const AdmitPatientSchema = z.object({
  department_id: z.string().uuid().optional(),
  referral_id: z.string().uuid().optional(),
  bed_code: z.string().max(50).trim().optional(),
  admission_notes: z.string().max(3000).trim().optional(),
})

export const DischargePatientSchema = z.object({
  discharge_notes: z.string().max(3000).trim().optional(),
})

export type AdmitPatientInput = z.infer<typeof AdmitPatientSchema>
export type DischargePatientInput = z.infer<typeof DischargePatientSchema>
