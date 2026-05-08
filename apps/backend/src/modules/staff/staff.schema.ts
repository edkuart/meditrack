import { z } from 'zod'

// Roles a clinic admin can invite (SUPER_ADMIN is platform-only)
const InviteableRole = z.enum(['ADMIN_CLINIC', 'DOCTOR', 'NURSE', 'ASSISTANT'])

export const InviteStaffSchema = z.object({
  email: z.string().email(),
  role: InviteableRole.default('DOCTOR'),
})

export const AcceptInviteSchema = z.object({
  token: z.string().min(1),
  first_name: z.string().min(1).max(100).trim(),
  last_name: z.string().min(1).max(100).trim(),
  password: z.string().min(8).max(128),
  specialty: z.string().max(100).trim().optional(),
  professional_id: z.string().max(50).trim().optional(),
})

export type InviteStaffInput = z.infer<typeof InviteStaffSchema>
export type AcceptInviteInput = z.infer<typeof AcceptInviteSchema>
