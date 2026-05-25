import { z } from 'zod'
import { isPermission } from '../../shared/permissions.ts'

// Roles a clinic/hospital admin can invite (SUPER_ADMIN is platform-only)
const InviteableRole = z.enum([
  'ADMIN_CLINIC', 'DOCTOR', 'NURSE', 'ASSISTANT',
  'LAB_TECHNICIAN', 'RADIOLOGIST', 'PHARMACIST', 'RECEPTIONIST', 'WARD_NURSE',
])

export const InviteStaffSchema = z.object({
  email: z.string().email(),
  role: InviteableRole.default('DOCTOR'),
  custom_role_id: z.string().uuid().optional(),
  // Hospital only: auto-assign to this department on acceptance
  department_id: z.string().uuid().optional(),
})

export const AcceptInviteSchema = z.object({
  token: z.string().min(1),
  first_name: z.string().min(1).max(100).trim(),
  last_name: z.string().min(1).max(100).trim(),
  password: z.string().min(15).max(128),
  specialty: z.string().max(100).trim().optional(),
  professional_id: z.string().max(50).trim().optional(),
})

export const PromoteStaffSchema = z.object({
  role: InviteableRole,
  custom_role_id: z.string().uuid().nullable().optional(),
})

const PermissionValue = z.string().refine(isPermission, 'Unknown permission')

export const CreateCustomRoleSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  description: z.string().max(500).trim().optional(),
  base_role: InviteableRole.default('DOCTOR'),
  permissions: z.array(PermissionValue).max(60).default([]),
})

export const UpdateCustomRoleSchema = CreateCustomRoleSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required',
)

export type InviteStaffInput = z.infer<typeof InviteStaffSchema>
export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>
export type PromoteStaffInput = z.infer<typeof PromoteStaffSchema>
export type CreateCustomRoleInput = z.infer<typeof CreateCustomRoleSchema>
export type UpdateCustomRoleInput = z.infer<typeof UpdateCustomRoleSchema>
