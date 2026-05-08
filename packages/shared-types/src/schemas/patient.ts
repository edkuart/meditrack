import { z } from 'zod'

export const CreatePatientSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  date_of_birth: z.string().date(),
  sex: z.enum(['male', 'female', 'other']),
  phone: z.string().min(7).max(20).optional(),
  email: z.string().email().optional(),
  id_number: z.string().max(30).optional(),
})

export const UpdatePatientSchema = CreatePatientSchema.partial()

export type CreatePatientInput = z.infer<typeof CreatePatientSchema>
export type UpdatePatientInput = z.infer<typeof UpdatePatientSchema>

export interface Patient {
  id: string
  tenant_id: string
  first_name: string
  last_name: string
  date_of_birth: string
  sex: 'male' | 'female' | 'other'
  phone?: string
  email?: string
  id_number?: string
  is_active: boolean
  created_at: string
  updated_at: string
}
