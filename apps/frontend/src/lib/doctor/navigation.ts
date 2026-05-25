import { hasPermission, PERMISSIONS } from './permissions'

export interface ClinicalLandingUser {
  role?: string | null
  permissions?: readonly string[] | null
}

export function getDefaultClinicalPath(user: ClinicalLandingUser | null | undefined): string {
  if (hasPermission(user?.role, PERMISSIONS.PATIENT_READ, user?.permissions)) return '/patients'
  if (
    hasPermission(user?.role, PERMISSIONS.LAB_ORDER_READ, user?.permissions) ||
    hasPermission(user?.role, PERMISSIONS.LAB_RESULT_WRITE, user?.permissions)
  ) return '/lab'
  if (hasPermission(user?.role, PERMISSIONS.HOSPITAL_CENSUS_READ, user?.permissions)) return '/hospital'
  if (hasPermission(user?.role, PERMISSIONS.ANALYTICS_READ, user?.permissions)) return '/analytics'
  return '/dashboard'
}
