import { z } from 'zod'

export const CreatePatientSchema = z.object({
  first_name: z.string().min(1).max(100).trim(),
  last_name: z.string().min(1).max(100).trim(),
  date_of_birth: z.string().date().optional(),
  sex: z.enum(['male', 'female', 'other']).optional(),
  phone: z.string().min(7).max(30).trim().optional(),
  email: z.string().email().trim().optional(),
  id_number: z.string().max(30).trim().optional(),
  notes: z.string().max(1000).optional(),
  tags: z.array(z.string()).default([]),
})

export const UpdatePatientSchema = CreatePatientSchema.partial()

export const SearchPatientsSchema = z.object({
  q: z.string().min(1).max(100).trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
})

export type CreatePatientInput = z.infer<typeof CreatePatientSchema>
export type UpdatePatientInput = z.infer<typeof UpdatePatientSchema>
export type SearchPatientsInput = z.infer<typeof SearchPatientsSchema>
