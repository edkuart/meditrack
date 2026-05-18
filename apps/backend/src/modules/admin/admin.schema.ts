import { z } from 'zod'

export const AdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const RejectDoctorSchema = z.object({
  reason: z.string().min(10).max(500),
})

export const ListUsersQuerySchema = z.object({
  status: z.enum(['pending', 'verified', 'rejected', 'all']).default('pending'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const ListTenantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const UpdateTenantSchema = z.object({
  plan_type: z.enum(['free', 'pro', 'enterprise']).optional(),
  status: z.enum(['active', 'suspended', 'cancelled']).optional(),
})

export type AdminLoginInput = z.infer<typeof AdminLoginSchema>
export type RejectDoctorInput = z.infer<typeof RejectDoctorSchema>
export type ListUsersQueryInput = z.infer<typeof ListUsersQuerySchema>
export type ListTenantsQueryInput = z.infer<typeof ListTenantsQuerySchema>
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>
