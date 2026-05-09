import { eq, and, count } from 'drizzle-orm'
import { db, tenants, patients, users } from '../db/index.ts'
import { AppError } from '../errors.ts'

// ─── Plan definitions ─────────────────────────────────────────────────────────

export const PLAN_LIMITS = {
  free:       { max_patients: 50,   max_staff: 3  },
  pro:        { max_patients: 2000, max_staff: 20 },
  enterprise: { max_patients: -1,   max_staff: -1 },  // -1 = unlimited
} as const

type Plan = keyof typeof PLAN_LIMITS

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getTenantPlan(tenantId: string): Promise<Plan> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { plan_type: true },
  })
  return (tenant?.plan_type ?? 'free') as Plan
}

// ─── Assertions — throw 402 if limit is reached ───────────────────────────────

export async function assertPatientLimit(tenantId: string): Promise<void> {
  const plan = await getTenantPlan(tenantId)
  const { max_patients } = PLAN_LIMITS[plan]
  if (max_patients === -1) return   // unlimited

  const [{ value: current }] = await db
    .select({ value: count() })
    .from(patients)
    .where(and(eq(patients.tenant_id, tenantId), eq(patients.is_active, true)))

  if (current >= max_patients) {
    throw new AppError(
      402,
      'PLAN_LIMIT_REACHED',
      `Has alcanzado el límite de ${max_patients} pacientes del plan ${plan}. Actualiza a Pro para continuar.`,
      { resource: 'patients', limit: max_patients, current, plan, upgrade_url: '/settings/billing' },
    )
  }
}

export async function assertStaffLimit(tenantId: string): Promise<void> {
  const plan = await getTenantPlan(tenantId)
  const { max_staff } = PLAN_LIMITS[plan]
  if (max_staff === -1) return   // unlimited

  const [{ value: current }] = await db
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.tenant_id, tenantId), eq(users.is_active, true)))

  if (current >= max_staff) {
    throw new AppError(
      402,
      'PLAN_LIMIT_REACHED',
      `Has alcanzado el límite de ${max_staff} miembros del equipo del plan ${plan}. Actualiza a Pro para continuar.`,
      { resource: 'staff', limit: max_staff, current, plan, upgrade_url: '/settings/billing' },
    )
  }
}
