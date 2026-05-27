import { eq, and, count, desc, gt, lte } from 'drizzle-orm'
import { db, tenants, patients, users, tenantAccessGrants } from '../db/index.ts'
import { AppError } from '../errors.ts'

// ─── Plan definitions ─────────────────────────────────────────────────────────

export const PLAN_LIMITS = {
  free:              { max_organizations: 1,  max_patients: 50,   max_staff: 1,  max_ai_units_monthly: 25   },
  doctor_individual: { max_organizations: 1,  max_patients: 500,  max_staff: 1,  max_ai_units_monthly: 500  },
  clinic_complete:   { max_organizations: 1,  max_patients: 2500, max_staff: 12, max_ai_units_monthly: 2000 },
  // Legacy values kept for existing tenants/webhooks while the commercial catalog migrates.
  pro:               { max_organizations: 1,  max_patients: 500,  max_staff: 1,  max_ai_units_monthly: 500  },
  enterprise:        { max_organizations: -1, max_patients: -1,   max_staff: -1, max_ai_units_monthly: -1   },
} as const

type Plan = keyof typeof PLAN_LIMITS

export type TenantCapability =
  | 'staff.invites'
  | 'roles.custom'
  | 'analytics.advanced'
  | 'lab.external'
  | 'hospital.census'
  | 'audit.export'
  | 'compliance.center'

const PLAN_CAPABILITIES: Record<Plan, ReadonlySet<TenantCapability>> = {
  free: new Set(),
  doctor_individual: new Set(),
  clinic_complete: new Set([
    'staff.invites',
    'roles.custom',
    'analytics.advanced',
    'lab.external',
    'hospital.census',
    'audit.export',
    'compliance.center',
  ]),
  pro: new Set(),
  enterprise: new Set([
    'staff.invites',
    'roles.custom',
    'analytics.advanced',
    'lab.external',
    'hospital.census',
    'audit.export',
    'compliance.center',
  ]),
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getTenantPlan(tenantId: string): Promise<Plan> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { plan_type: true },
  })
  return (tenant?.plan_type ?? 'free') as Plan
}

async function getActiveAccessGrant(tenantId: string) {
  const now = new Date()
  return db.query.tenantAccessGrants.findFirst({
    where: and(
      eq(tenantAccessGrants.tenant_id, tenantId),
      eq(tenantAccessGrants.status, 'active'),
      lte(tenantAccessGrants.starts_at, now),
      gt(tenantAccessGrants.ends_at, now),
    ),
    orderBy: [desc(tenantAccessGrants.ends_at)],
  })
}

export async function getTenantEntitlements(tenantId: string) {
  const basePlan = await getTenantPlan(tenantId)
  const activeGrant = await getActiveAccessGrant(tenantId)
  const plan = (activeGrant?.plan_type ?? basePlan) as Plan
  const baseLimits = PLAN_LIMITS[plan]
  return {
    plan,
    base_plan: basePlan,
    access_grant: activeGrant ? {
      id: activeGrant.id,
      grant_type: activeGrant.grant_type,
      starts_at: activeGrant.starts_at,
      ends_at: activeGrant.ends_at,
      reason: activeGrant.reason,
    } : null,
    limits: {
      max_organizations: activeGrant?.max_organizations ?? baseLimits.max_organizations,
      max_patients: activeGrant?.max_patients ?? baseLimits.max_patients,
      max_staff: activeGrant?.max_staff ?? baseLimits.max_staff,
      max_ai_units_monthly: activeGrant?.max_ai_units_monthly ?? baseLimits.max_ai_units_monthly,
    },
    capabilities: Array.from(PLAN_CAPABILITIES[plan]),
  }
}

export async function tenantHasCapability(tenantId: string, capability: TenantCapability): Promise<boolean> {
  const entitlements = await getTenantEntitlements(tenantId)
  return PLAN_CAPABILITIES[entitlements.plan].has(capability)
}

export async function requireTenantCapability(
  tenantId: string,
  capability: TenantCapability,
  message = 'Esta funcionalidad no está incluida en el plan actual.',
): Promise<void> {
  if (await tenantHasCapability(tenantId, capability)) return
  const plan = await getTenantPlan(tenantId)
  throw new AppError(
    402,
    'PLAN_CAPABILITY_REQUIRED',
    message,
    { capability, plan, upgrade_url: '/settings/billing' },
  )
}

// ─── Assertions — throw 402 if limit is reached ───────────────────────────────

export async function assertPatientLimit(tenantId: string): Promise<void> {
  const entitlements = await getTenantEntitlements(tenantId)
  const { plan } = entitlements
  const { max_patients } = entitlements.limits
  if (max_patients === -1) return   // unlimited

  const [{ value: current }] = await db
    .select({ value: count() })
    .from(patients)
    .where(and(eq(patients.tenant_id, tenantId), eq(patients.is_active, true)))

  if (current >= max_patients) {
    throw new AppError(
      402,
      'PLAN_LIMIT_REACHED',
      `Has alcanzado el límite de ${max_patients} pacientes activos de tu plan. Actualiza tu suscripción para continuar.`,
      { resource: 'patients', limit: max_patients, current, plan, upgrade_url: '/settings/billing' },
    )
  }
}

export async function assertStaffLimit(tenantId: string): Promise<void> {
  const entitlements = await getTenantEntitlements(tenantId)
  const { plan } = entitlements
  const { max_staff } = entitlements.limits
  if (max_staff === -1) return   // unlimited

  const [{ value: current }] = await db
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.tenant_id, tenantId), eq(users.is_active, true)))

  if (current >= max_staff) {
    throw new AppError(
      402,
      'PLAN_LIMIT_REACHED',
      `Has alcanzado el límite de ${max_staff} miembros del equipo de tu plan. Actualiza tu suscripción para continuar.`,
      { resource: 'staff', limit: max_staff, current, plan, upgrade_url: '/settings/billing' },
    )
  }
}
