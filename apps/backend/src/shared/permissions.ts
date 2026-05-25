import type { Context, Next } from 'hono'
import type { userRoleEnum } from './db/schema/users.ts'
import { and, eq } from 'drizzle-orm'
import { customRoles, db } from './db/index.ts'
import { ForbiddenError, UnauthorizedError } from './errors.ts'

type UserRole = (typeof userRoleEnum.enumValues)[number]

export const PERMISSIONS = {
  PATIENT_READ: 'patient.read',
  PATIENT_WRITE: 'patient.write',
  PATIENT_SENSITIVE_READ: 'patient.sensitive.read',
  PATIENT_BACKGROUND_WRITE: 'patient.background.write',
  PATIENT_PROBLEM_WRITE: 'patient.problem.write',
  PATIENT_ACCESS_MANAGE: 'patient.access.manage',

  ENCOUNTER_READ: 'encounter.read',
  ENCOUNTER_WRITE: 'encounter.write',

  VITALS_READ: 'vitals.read',
  VITALS_WRITE: 'vitals.write',

  LAB_ORDER_READ: 'lab.order.read',
  LAB_ORDER_WRITE: 'lab.order.write',
  LAB_RESULT_WRITE: 'lab.result.write',
  LAB_EXTERNAL_REVIEW: 'lab.external.review',

  DOCUMENT_READ: 'document.read',
  DOCUMENT_WRITE: 'document.write',
  DOCUMENT_PROCESS: 'document.process',
  DOCUMENT_VISIBILITY_WRITE: 'document.visibility.write',
  DOCUMENT_DELETE: 'document.delete',

  TREATMENT_READ: 'treatment.read',
  TREATMENT_WRITE: 'treatment.write',
  TREATMENT_ADHERENCE_READ: 'treatment.adherence.read',

  HOSPITAL_CENSUS_READ: 'hospital.census.read',
  ADMISSION_WRITE: 'admission.write',

  REFERRAL_READ: 'referral.read',
  REFERRAL_WRITE: 'referral.write',

  STAFF_MANAGE: 'staff.manage',
  HOSPITAL_MANAGE: 'hospital.manage',
  ANALYTICS_READ: 'analytics.read',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

const ALL_CLINICAL: Permission[] = [
  PERMISSIONS.PATIENT_READ,
  PERMISSIONS.PATIENT_WRITE,
  PERMISSIONS.PATIENT_SENSITIVE_READ,
  PERMISSIONS.PATIENT_BACKGROUND_WRITE,
  PERMISSIONS.PATIENT_PROBLEM_WRITE,
  PERMISSIONS.PATIENT_ACCESS_MANAGE,
  PERMISSIONS.ENCOUNTER_READ,
  PERMISSIONS.ENCOUNTER_WRITE,
  PERMISSIONS.VITALS_READ,
  PERMISSIONS.VITALS_WRITE,
  PERMISSIONS.LAB_ORDER_READ,
  PERMISSIONS.LAB_ORDER_WRITE,
  PERMISSIONS.LAB_RESULT_WRITE,
  PERMISSIONS.LAB_EXTERNAL_REVIEW,
  PERMISSIONS.DOCUMENT_READ,
  PERMISSIONS.DOCUMENT_WRITE,
  PERMISSIONS.DOCUMENT_PROCESS,
  PERMISSIONS.DOCUMENT_VISIBILITY_WRITE,
  PERMISSIONS.DOCUMENT_DELETE,
  PERMISSIONS.TREATMENT_READ,
  PERMISSIONS.TREATMENT_WRITE,
  PERMISSIONS.TREATMENT_ADHERENCE_READ,
  PERMISSIONS.HOSPITAL_CENSUS_READ,
  PERMISSIONS.ADMISSION_WRITE,
  PERMISSIONS.REFERRAL_READ,
  PERMISSIONS.REFERRAL_WRITE,
]

export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set([
    ...ALL_CLINICAL,
    PERMISSIONS.STAFF_MANAGE,
    PERMISSIONS.HOSPITAL_MANAGE,
    PERMISSIONS.ANALYTICS_READ,
  ]),
  ADMIN_CLINIC: new Set([
    ...ALL_CLINICAL,
    PERMISSIONS.STAFF_MANAGE,
    PERMISSIONS.HOSPITAL_MANAGE,
    PERMISSIONS.ANALYTICS_READ,
  ]),
  DOCTOR: new Set(ALL_CLINICAL),
  NURSE: new Set([
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.ENCOUNTER_READ,
    PERMISSIONS.VITALS_READ,
    PERMISSIONS.VITALS_WRITE,
    PERMISSIONS.LAB_ORDER_READ,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.TREATMENT_READ,
    PERMISSIONS.TREATMENT_ADHERENCE_READ,
    PERMISSIONS.HOSPITAL_CENSUS_READ,
    PERMISSIONS.REFERRAL_READ,
  ]),
  WARD_NURSE: new Set([
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.ENCOUNTER_READ,
    PERMISSIONS.VITALS_READ,
    PERMISSIONS.VITALS_WRITE,
    PERMISSIONS.LAB_ORDER_READ,
    PERMISSIONS.TREATMENT_READ,
    PERMISSIONS.TREATMENT_ADHERENCE_READ,
    PERMISSIONS.HOSPITAL_CENSUS_READ,
    PERMISSIONS.REFERRAL_READ,
  ]),
  LAB_TECHNICIAN: new Set([
    PERMISSIONS.LAB_ORDER_READ,
    PERMISSIONS.LAB_RESULT_WRITE,
    PERMISSIONS.LAB_EXTERNAL_REVIEW,
  ]),
  RADIOLOGIST: new Set([
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_WRITE,
    PERMISSIONS.DOCUMENT_PROCESS,
  ]),
  PHARMACIST: new Set([
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.TREATMENT_READ,
    PERMISSIONS.TREATMENT_ADHERENCE_READ,
  ]),
  RECEPTIONIST: new Set([
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.PATIENT_WRITE,
  ]),
  ASSISTANT: new Set([
    PERMISSIONS.PATIENT_READ,
    PERMISSIONS.PATIENT_WRITE,
    PERMISSIONS.VITALS_READ,
    PERMISSIONS.VITALS_WRITE,
    PERMISSIONS.LAB_ORDER_READ,
    PERMISSIONS.LAB_ORDER_WRITE,
    PERMISSIONS.TREATMENT_READ,
  ]),
}

export const ALL_PERMISSIONS = Object.values(PERMISSIONS)

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value)
}

export function normalizePermissions(values: readonly string[] | null | undefined): Permission[] {
  return Array.from(new Set((values ?? []).filter(isPermission)))
}

export function defaultPermissionsForRole(role: string | undefined | null): Permission[] {
  if (!role) return []
  return Array.from(ROLE_PERMISSIONS[role as UserRole] ?? [])
}

export async function resolveEffectivePermissions(
  tenantId: string,
  role: string | undefined | null,
  customRoleId?: string | null,
): Promise<Permission[]> {
  if (!customRoleId) return defaultPermissionsForRole(role)

  const customRole = await db.query.customRoles.findFirst({
    where: and(
      eq(customRoles.id, customRoleId),
      eq(customRoles.tenant_id, tenantId),
      eq(customRoles.is_active, true),
    ),
    columns: { permissions: true },
  })

  return customRole ? normalizePermissions(customRole.permissions) : defaultPermissionsForRole(role)
}

export function hasPermission(
  role: string | undefined | null,
  permission: Permission,
  effectivePermissions?: readonly string[] | null,
): boolean {
  if (effectivePermissions) return effectivePermissions.includes(permission)
  return defaultPermissionsForRole(role).includes(permission)
}

export function requirePermission(permission: Permission) {
  return async (c: Context, next: Next) => {
    const auth = c.get('auth')
    if (!auth) throw new UnauthorizedError()

    if (!hasPermission(auth.role, permission, auth.permissions)) {
      throw new ForbiddenError(
        `Permission ${permission} is required for this action`,
        'MISSING_PERMISSION',
      )
    }

    await next()
  }
}
