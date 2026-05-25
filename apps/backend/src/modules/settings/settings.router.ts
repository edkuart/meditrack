import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { PERMISSIONS, requirePermission } from '../../shared/permissions.ts'
import {
  getClinicProfile,
  updateClinicProfile,
  listAuditLogs,
  getActiveSessions,
  revokeSession,
  revokeAllSessions,
} from './settings.service.ts'

const router = new Hono()
router.use('*', requireAuth)

// ─── Clinic profile ───────────────────────────────────────────────────────────

router.get('/settings/clinic', async (c) => {
  const { tenant_id } = c.get('auth')
  const data = await getClinicProfile(tenant_id)
  return c.json({ success: true, data })
})

router.patch(
  '/settings/clinic',
  requirePermission(PERMISSIONS.HOSPITAL_MANAGE),
  zValidator('json', z.object({ name: z.string().min(2).max(200) })),
  async (c) => {
    const { tenant_id, sub, email } = c.get('auth')
    const data = await updateClinicProfile(tenant_id, sub, email, c.req.valid('json'))
    return c.json({ success: true, data })
  },
)

// ─── Audit log viewer (admin only) ────────────────────────────────────────────

router.get(
  '/settings/audit-logs',
  requirePermission(PERMISSIONS.HOSPITAL_MANAGE),
  async (c) => {
    const { tenant_id } = c.get('auth')
    const page = Math.max(1, Number(c.req.query('page') ?? 1))
    const limit = Math.min(100, Math.max(10, Number(c.req.query('limit') ?? 50)))
    const action = c.req.query('action')
    const actor_id = c.req.query('actor_id')

    const data = await listAuditLogs(tenant_id, { page, limit, action, actor_id })
    return c.json({ success: true, data })
  },
)

// ─── Session management ───────────────────────────────────────────────────────

router.get('/settings/sessions', async (c) => {
  const { sub } = c.get('auth')
  const data = await getActiveSessions(sub)
  return c.json({ success: true, data })
})

router.delete('/settings/sessions/all', async (c) => {
  const { sub } = c.get('auth')
  const revoked = await revokeAllSessions(sub)
  return c.json({ success: true, data: { revoked } })
})

router.delete('/settings/sessions/:id', async (c) => {
  const { sub } = c.get('auth')
  await revokeSession(sub, c.req.param('id')!)
  return c.json({ success: true, data: null })
})

export { router as settingsRouter }
