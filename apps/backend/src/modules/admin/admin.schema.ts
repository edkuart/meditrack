import { z } from 'zod'

export const AdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
})

export const AdminMfaVerifySchema = z.object({
  mfa_token: z.string().min(1),
  code: z.string().regex(/^\d[\d\s]{4,10}\d$/, 'Invalid MFA code'),
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

export const ListPasswordTicketsQuerySchema = z.object({
  status: z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED', 'all']).default('OPEN'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const ListAdminAuditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  tenant_id: z.string().uuid().optional(),
  actor_id: z.string().uuid().optional(),
  action: z.string().min(1).max(80).optional(),
})

export const UpdateTenantSchema = z.object({
  plan_type: z.enum(['free', 'pro', 'enterprise']).optional(),
  status: z.enum(['active', 'suspended', 'cancelled']).optional(),
})

export const UpdatePasswordTicketSchema = z.object({
  status: z.enum(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED']).optional(),
  admin_notes: z.string().max(1000).optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required',
)

export type AdminLoginInput = z.infer<typeof AdminLoginSchema>
export type AdminMfaVerifyInput = z.infer<typeof AdminMfaVerifySchema>
export type RejectDoctorInput = z.infer<typeof RejectDoctorSchema>
export type ListUsersQueryInput = z.infer<typeof ListUsersQuerySchema>
export type ListTenantsQueryInput = z.infer<typeof ListTenantsQuerySchema>
export type ListPasswordTicketsQueryInput = z.infer<typeof ListPasswordTicketsQuerySchema>
export type ListAdminAuditLogsQueryInput = z.infer<typeof ListAdminAuditLogsQuerySchema>
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>
export type UpdatePasswordTicketInput = z.infer<typeof UpdatePasswordTicketSchema>
