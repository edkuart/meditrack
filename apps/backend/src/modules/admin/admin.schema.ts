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

export const UpdateUserStatusSchema = z.object({
  is_active: z.boolean(),
  reason: z.string().max(500).optional(),
}).refine(
  (value) => value.is_active || !!value.reason?.trim() && value.reason.trim().length >= 10,
  'reason is required when deactivating a user',
)

export const ListUsersQuerySchema = z.object({
  status: z.enum(['pending', 'verified', 'rejected', 'all']).default('pending'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const ListTenantsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const ListCommercialAccountsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
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
  plan_type: z.enum(['free', 'doctor_individual', 'clinic_complete', 'pro', 'enterprise']).optional(),
  status: z.enum(['active', 'suspended', 'cancelled']).optional(),
  reason: z.string().max(500).optional(),
}).refine(
  (value) => !value.status || value.status === 'active' || !!value.reason?.trim() && value.reason.trim().length >= 10,
  'reason is required when suspending or cancelling a tenant',
)

export const CreateTenantAccessGrantSchema = z.object({
  grant_type: z.enum(['trial', 'promo', 'manual_override', 'internal_demo']).default('trial'),
  plan_type: z.enum(['doctor_individual', 'clinic_complete']),
  duration: z.enum(['1_day', '7_days', '30_days', '365_days', 'custom']),
  ends_at: z.string().datetime().optional(),
  reason: z.string().min(10).max(500),
  notes: z.string().max(2000).optional(),
  max_ai_units_monthly: z.coerce.number().int().min(0).max(1000000).optional(),
  max_organizations: z.coerce.number().int().min(1).max(10000).optional(),
  max_staff: z.coerce.number().int().min(1).max(10000).optional(),
  max_patients: z.coerce.number().int().min(1).max(1000000).optional(),
}).refine(
  (value) => value.duration !== 'custom' || !!value.ends_at,
  'ends_at is required for custom duration',
)

export const RevokeTenantAccessGrantSchema = z.object({
  reason: z.string().min(10).max(500),
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
export type UpdateUserStatusInput = z.infer<typeof UpdateUserStatusSchema>
export type ListUsersQueryInput = z.infer<typeof ListUsersQuerySchema>
export type ListTenantsQueryInput = z.infer<typeof ListTenantsQuerySchema>
export type ListCommercialAccountsQueryInput = z.infer<typeof ListCommercialAccountsQuerySchema>
export type ListPasswordTicketsQueryInput = z.infer<typeof ListPasswordTicketsQuerySchema>
export type ListAdminAuditLogsQueryInput = z.infer<typeof ListAdminAuditLogsQuerySchema>
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>
export type CreateTenantAccessGrantInput = z.infer<typeof CreateTenantAccessGrantSchema>
export type RevokeTenantAccessGrantInput = z.infer<typeof RevokeTenantAccessGrantSchema>
export type UpdatePasswordTicketInput = z.infer<typeof UpdatePasswordTicketSchema>
