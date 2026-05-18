import { z } from 'zod'

const DEPARTMENT_TYPES = [
  'GENERAL', 'LAB', 'RADIOLOGY', 'PHARMACY', 'EMERGENCY',
  'ICU', 'SURGERY', 'PEDIATRICS', 'OBSTETRICS', 'CARDIOLOGY',
  'NEUROLOGY', 'ONCOLOGY', 'ORTHOPEDICS', 'PSYCHIATRY', 'OTHER',
] as const

export const CreateDepartmentSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(DEPARTMENT_TYPES).default('GENERAL'),
  head_doctor_id: z.string().uuid().optional(),
})

export const UpdateDepartmentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(DEPARTMENT_TYPES).optional(),
  head_doctor_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
})

export const AddMemberSchema = z.object({
  user_id: z.string().uuid(),
})

export type CreateDepartmentInput = z.infer<typeof CreateDepartmentSchema>
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>
export type AddMemberInput = z.infer<typeof AddMemberSchema>
