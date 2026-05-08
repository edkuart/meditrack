import { db, auditLogs, type NewAuditLog } from '../db/index.ts'
import type { auditActionEnum } from '../db/schema/audit-logs.ts'

type AuditAction = (typeof auditActionEnum.enumValues)[number]

interface AuditParams {
  tenant_id: string
  actor_id: string
  actor_type: 'USER' | 'PATIENT' | 'SYSTEM'
  actor_email?: string
  action: AuditAction
  resource_type: string
  resource_id?: string
  ip_address?: string
  user_agent?: string
  changes?: { before?: unknown; after?: unknown }
  context?: Record<string, unknown>
}

export async function createAuditLog(params: AuditParams): Promise<void> {
  const entry: NewAuditLog = {
    tenant_id: params.tenant_id,
    actor_id: params.actor_id,
    actor_type: params.actor_type,
    actor_email: params.actor_email,
    action: params.action,
    resource_type: params.resource_type,
    resource_id: params.resource_id,
    ip_address: params.ip_address,
    user_agent: params.user_agent,
    changes: params.changes as Record<string, unknown> | undefined,
    context: (params.context ?? {}) as Record<string, unknown>,
  }

  // Fire-and-forget — audit log failure must never break the main request
  db.insert(auditLogs).values(entry).catch((err) => {
    console.error('[audit] failed to write audit log:', err)
  })
}
