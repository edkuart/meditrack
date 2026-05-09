import { eq, and, count } from 'drizzle-orm'
import { db, patients, users, encounters, treatmentPlans, tenants } from '../../shared/db/index.ts'

export interface OnboardingStep {
  key: string
  done: boolean
}

export interface OnboardingStatus {
  completed: boolean
  completed_count: number
  total_count: number
  steps: {
    has_patient: boolean
    has_encounter: boolean
    has_treatment: boolean
    has_staff: boolean
    has_billing: boolean
  }
}

export async function getOnboardingStatus(tenantId: string): Promise<OnboardingStatus> {
  const [
    [{ value: patientCount }],
    [{ value: encounterCount }],
    [{ value: treatmentCount }],
    [{ value: staffCount }],
    tenant,
  ] = await Promise.all([
    db.select({ value: count() }).from(patients)
      .where(and(eq(patients.tenant_id, tenantId), eq(patients.is_active, true))),

    db.select({ value: count() }).from(encounters)
      .where(eq(encounters.tenant_id, tenantId)),

    db.select({ value: count() }).from(treatmentPlans)
      .where(eq(treatmentPlans.tenant_id, tenantId)),

    // Staff count > 1 means at least one person besides the owner was invited
    db.select({ value: count() }).from(users)
      .where(and(eq(users.tenant_id, tenantId), eq(users.is_active, true))),

    db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
      columns: { plan_type: true },
    }),
  ])

  const steps = {
    has_patient: patientCount > 0,
    has_encounter: encounterCount > 0,
    has_treatment: treatmentCount > 0,
    has_staff: staffCount > 1,   // >1 because owner already exists
    has_billing: (tenant?.plan_type ?? 'free') !== 'free',
  }

  // Required steps (billing and staff are optional/bonus)
  const required = [steps.has_patient, steps.has_encounter, steps.has_treatment]
  const all = Object.values(steps)
  const completed_count = all.filter(Boolean).length

  return {
    completed: required.every(Boolean),
    completed_count,
    total_count: all.length,
    steps,
  }
}
