import { eq, and, desc, gt, count } from 'drizzle-orm'
import { db, tenants, auditLogs, refreshTokens } from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { NotFoundError } from '../../shared/errors.ts'

// ─── Clinic profile ───────────────────────────────────────────────────────────

export interface ClinicSettings {
  phone?: string
  contact_email?: string
  address?: string
  city?: string
  country?: string
  specialty?: string
  website?: string
  business_hours?: string
}

export async function getClinicProfile(tenantId: string) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: {
      id: true,
      name: true,
      slug: true,
      plan_type: true,
      status: true,
      settings: true,
      subscription_current_period_end: true,
      created_at: true,
    },
  })
  if (!tenant) throw new NotFoundError('Clinic')
  return tenant
}

export interface UpdateClinicInput {
  name: string
  phone?: string
  contact_email?: string
  address?: string
  city?: string
  country?: string
  specialty?: string
  website?: string
  business_hours?: string
}

export async function updateClinicProfile(
  tenantId: string,
  actorId: string,
  actorEmail: string,
  input: UpdateClinicInput,
) {
  const existing = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { id: true, name: true, settings: true },
  })
  if (!existing) throw new NotFoundError('Clinic')

  const { name, ...settingsFields } = input
  const prevSettings = (existing.settings ?? {}) as ClinicSettings
  const newSettings: ClinicSettings = { ...prevSettings }

  for (const key of Object.keys(settingsFields) as (keyof ClinicSettings)[]) {
    const val = settingsFields[key]
    if (val !== undefined) newSettings[key] = val
    else delete newSettings[key]
  }

  await db.update(tenants)
    .set({ name, settings: newSettings, updated_at: new Date() })
    .where(eq(tenants.id, tenantId))

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'SETTINGS_CHANGED',
    resource_type: 'TENANT',
    resource_id: tenantId,
    changes: {
      before: { name: existing.name, settings: prevSettings },
      after: { name, settings: newSettings },
    },
  })

  return { ...existing, name, settings: newSettings }
}

// ─── Audit log viewer ─────────────────────────────────────────────────────────

export interface AuditLogQuery {
  page: number
  limit: number
  action?: string
  actor_id?: string
}

export async function listAuditLogs(tenantId: string, query: AuditLogQuery) {
  const { page, limit, action, actor_id } = query
  const offset = (page - 1) * limit

  const conditions = [eq(auditLogs.tenant_id, tenantId)]
  if (action) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conditions.push(eq(auditLogs.action, action as any))
  }
  if (actor_id) {
    conditions.push(eq(auditLogs.actor_id, actor_id))
  }

  const where = and(...conditions)

  const [rows, [{ total }]] = await Promise.all([
    db.select({
      id: auditLogs.id,
      actor_id: auditLogs.actor_id,
      actor_type: auditLogs.actor_type,
      actor_email: auditLogs.actor_email,
      action: auditLogs.action,
      resource_type: auditLogs.resource_type,
      resource_id: auditLogs.resource_id,
      changes: auditLogs.changes,
      context: auditLogs.context,
      created_at: auditLogs.created_at,
    })
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.created_at))
      .limit(limit)
      .offset(offset),

    db.select({ total: count() }).from(auditLogs).where(where),
  ])

  return {
    logs: rows,
    meta: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
  }
}

// ─── Session management ───────────────────────────────────────────────────────

export async function getActiveSessions(userId: string) {
  const sessions = await db.query.refreshTokens.findMany({
    where: and(
      eq(refreshTokens.user_id, userId),
      eq(refreshTokens.is_revoked, false),
      gt(refreshTokens.expires_at, new Date()),
    ),
    columns: {
      id: true,
      device_hint: true,
      created_at: true,
      expires_at: true,
      used_at: true,
    },
    orderBy: (t, { desc }) => desc(t.created_at),
  })
  return sessions
}

export async function revokeSession(userId: string, sessionId: string) {
  const session = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.id, sessionId),
      eq(refreshTokens.user_id, userId),
    ),
    columns: { id: true },
  })
  if (!session) throw new NotFoundError('Session')

  await db.update(refreshTokens)
    .set({ is_revoked: true, used_at: new Date() })
    .where(eq(refreshTokens.id, sessionId))
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const result = await db.update(refreshTokens)
    .set({ is_revoked: true, used_at: new Date() })
    .where(and(
      eq(refreshTokens.user_id, userId),
      eq(refreshTokens.is_revoked, false),
    ))
    .returning({ id: refreshTokens.id })

  return result.length
}
