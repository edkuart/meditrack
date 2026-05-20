import { Hono } from 'hono'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import {
  listDoctorNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from './doctor-notifications.service.ts'

const router = new Hono()

// ─── List own notifications ────────────────────────────────────────────────────
router.get('/doctor-notifications', requireAuth, async (c) => {
  const { tenant_id, sub } = c.get('auth')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '40'), 100)

  const data = await listDoctorNotifications(tenant_id, sub, limit)
  const unread_count = data.filter(n => !n.is_read).length

  return c.json({ success: true, data, meta: { total: data.length, unread_count } })
})

// ─── Mark one as read ─────────────────────────────────────────────────────────
router.patch('/doctor-notifications/:id/read', requireAuth, async (c) => {
  const { tenant_id, sub } = c.get('auth')
  await markNotificationRead(tenant_id, sub, c.req.param('id')!)
  return c.json({ success: true })
})

// ─── Mark all as read ─────────────────────────────────────────────────────────
router.post('/doctor-notifications/read-all', requireAuth, async (c) => {
  const { tenant_id, sub } = c.get('auth')
  await markAllNotificationsRead(tenant_id, sub)
  return c.json({ success: true })
})

export { router as doctorNotificationsRouter }
