export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN_CLINIC: 'ADMIN_CLINIC',
  DOCTOR: 'DOCTOR',
  NURSE: 'NURSE',
  ASSISTANT: 'ASSISTANT',
} as const

export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const PatientAccessChannel = {
  MAGIC_LINK: 'magic_link',
  QR: 'qr',
  PIN: 'pin',
  WHATSAPP: 'whatsapp',
} as const

export type PatientAccessChannel = (typeof PatientAccessChannel)[keyof typeof PatientAccessChannel]
