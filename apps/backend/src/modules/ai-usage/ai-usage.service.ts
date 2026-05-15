import { and, count, desc, eq, gte, sql } from 'drizzle-orm'
import { aiUsageEvents, db, tenants } from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { PLAN_LIMITS } from '../../shared/services/limits.service.ts'
import { AppError, NotFoundError } from '../../shared/errors.ts'
import { RecordAiUsageSchema } from './ai-usage.schema.ts'
import type { RecordAiUsageInput } from './ai-usage.schema.ts'

type Plan = keyof typeof PLAN_LIMITS

function monthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0))
}

async function getTenantPlan(tenantId: string): Promise<Plan> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { plan_type: true },
  })
  if (!tenant) throw new NotFoundError('Tenant')
  return tenant.plan_type as Plan
}

export function aiFeatureFromAssistMode(mode: string): RecordAiUsageInput['feature'] {
  if (mode === 'SUMMARIZE_ENCOUNTER') return 'ENCOUNTER_SUMMARY'
  if (mode === 'SIMPLIFY_FOR_PATIENT') return 'PATIENT_SIMPLIFICATION'
  if (
    mode === 'ASK_CLINICAL_QUESTION' ||
    mode === 'PREPARE_CONSULTATION' ||
    mode === 'SUGGEST_PATIENT_QUESTIONS' ||
    mode === 'DRAFT_SOAP' ||
    mode === 'REVIEW_CLINICAL_GAPS'
  ) return 'CLINICAL_COPILOT'
  return 'OTHER'
}

export async function getAiUsageStatus(tenantId: string) {
  const plan = await getTenantPlan(tenantId)
  const limit = PLAN_LIMITS[plan].max_ai_units_monthly
  const since = monthStart()

  const [{ unitsUsed }] = await db
    .select({ unitsUsed: sql<number>`coalesce(sum(${aiUsageEvents.units}), 0)::int` })
    .from(aiUsageEvents)
    .where(and(eq(aiUsageEvents.tenant_id, tenantId), gte(aiUsageEvents.created_at, since)))

  const [{ eventCount }] = await db
    .select({ eventCount: count() })
    .from(aiUsageEvents)
    .where(and(eq(aiUsageEvents.tenant_id, tenantId), gte(aiUsageEvents.created_at, since)))

  return {
    plan,
    period: { starts_at: since },
    limit,
    used: Number(unitsUsed),
    remaining: limit === -1 ? -1 : Math.max(limit - Number(unitsUsed), 0),
    event_count: Number(eventCount),
  }
}

export async function assertAiUsageLimit(tenantId: string, requestedUnits = 1) {
  const status = await getAiUsageStatus(tenantId)
  if (status.limit === -1) return status

  if (status.used + requestedUnits > status.limit) {
    throw new AppError(
      402,
      'AI_PLAN_LIMIT_REACHED',
      `Has alcanzado el límite mensual de IA de tu plan ${status.plan}. Actualiza tu plan para continuar.`,
      {
        resource: 'ai_usage',
        plan: status.plan,
        limit: status.limit,
        used: status.used,
        requested_units: requestedUnits,
        upgrade_url: '/settings/billing',
      },
    )
  }

  return status
}

export async function recordAiUsage(
  tenantId: string,
  actorId: string,
  actorEmail: string,
  input: RecordAiUsageInput,
) {
  const usage = RecordAiUsageSchema.parse(input)

  await assertAiUsageLimit(tenantId, usage.units)

  const [event] = await db.insert(aiUsageEvents).values({
    tenant_id: tenantId,
    actor_id: actorId,
    patient_id: usage.patient_id,
    encounter_id: usage.encounter_id,
    feature: usage.feature,
    provider: usage.provider,
    model: usage.model,
    units: usage.units,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    estimated_cost_cents: usage.estimated_cost_cents,
    resource_type: usage.resource_type,
    resource_id: usage.resource_id,
    metadata: usage.metadata,
  }).returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'AI_USAGE_RECORDED',
    resource_type: 'AI_USAGE_EVENT',
    resource_id: event.id,
    context: {
      patient_id: usage.patient_id,
      encounter_id: usage.encounter_id,
      feature: usage.feature,
      provider: usage.provider,
      model: usage.model,
      units: usage.units,
    },
  })

  return event
}

export async function listAiUsageEvents(tenantId: string, limit = 50, patientId?: string) {
  return db.query.aiUsageEvents.findMany({
    where: patientId
      ? and(eq(aiUsageEvents.tenant_id, tenantId), eq(aiUsageEvents.patient_id, patientId))
      : eq(aiUsageEvents.tenant_id, tenantId),
    orderBy: desc(aiUsageEvents.created_at),
    limit,
  })
}
