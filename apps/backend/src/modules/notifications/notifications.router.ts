import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { db, notificationLogs, patients } from '../../shared/db/index.ts'

const router = new Hono()

router.get('/patients/:patientId/notifications', requireAuth, async (c) => {
  const auth = c.get('auth')
  const patientId = c.req.param('patientId')!

  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.id, patientId), eq(patients.tenant_id, auth.tenant_id)),
    columns: { id: true },
  })
  if (!patient) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found' } }, 404)
  }

  const logs = await db.query.notificationLogs.findMany({
    where: eq(notificationLogs.patient_id, patientId),
    orderBy: (n, { desc }) => desc(n.created_at),
    limit: 50,
    columns: {
      id: true,
      channel: true,
      type: true,
      status: true,
      recipient: true,
      sent_at: true,
      failed_reason: true,
      created_at: true,
    },
  })

  return c.json({ success: true, data: logs })
})

export { router as notificationsRouter }
