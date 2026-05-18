import { z } from 'zod'

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  clinic_name: z.string().min(1).max(200),
  clinic_slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens only'),
  // 'HOSPITAL' creates a hospital tenant; omit or 'CLINIC' for a regular clinic
  tenant_type: z.enum(['CLINIC', 'HOSPITAL']).default('CLINIC'),
  professional_id: z.string().max(50).optional(),
  colegiado_number: z.string().min(1).max(50),
  specialty: z.string().max(100).optional(),
  // Storage key returned after uploading the DPI image to the presigned URL
  dpi_document_key: z.string().max(500).optional(),
})

export const RefreshSchema = z.object({
  refresh_token: z.string().min(1),
})

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
})

export const UpdateProfileSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  specialty: z.string().max(100).optional(),
  professional_id: z.string().max(50).optional(),
})

export const ChangePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8).max(128),
})

export type LoginInput = z.infer<typeof LoginSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
export type RefreshInput = z.infer<typeof RefreshSchema>
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>
