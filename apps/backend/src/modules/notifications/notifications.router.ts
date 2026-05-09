import { Hono } from 'hono'
import { eq, and, desc } from 'drizzle-orm'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { db, notificationLogs, patients } from '../../shared/db/index.ts'

const router = new Hono()

// ─── Clinic-level notification feed (doctor dashboard) ───────────────────────
router.get('/notifications', requireAuth, async (c) => {
  const auth = c.get('auth')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '40'), 100)

  const rows = await db
    .select({
      id: notificationLogs.id,
      patient_id: notificationLogs.patient_id,
      patient_first_name: patients.first_name,
      patient_last_name: patients.last_name,
      channel: notificationLogs.channel,
      type: notificationLogs.type,
      status: notificationLogs.status,
      recipient: notificationLogs.recipient,
      attempt_count: notificationLogs.attempt_count,
      failed_reason: notificationLogs.failed_reason,
      created_at: notificationLogs.created_at,
      sent_at: notificationLogs.sent_at,
    })
    .from(notificationLogs)
    .innerJoin(patients, eq(notificationLogs.patient_id, patients.id))
    .where(eq(patients.tenant_id, auth.tenant_id))
    .orderBy(desc(notificationLogs.created_at))
    .limit(limit)

  const data = rows.map(({ patient_first_name, patient_last_name, ...rest }) => ({
    ...rest,
    patient_name: `${patient_first_name} ${patient_last_name}`,
  }))

  const failed = data.filter(d => d.status === 'FAILED' || d.status === 'BOUNCED').length

  return c.json({ success: true, data, meta: { total: data.length, failed } })
})

// ─── Per-patient notification log ────────────────────────────────────────────
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
      attempt_count: true,
      last_attempt_at: true,
      next_retry_at: true,
      sent_at: true,
      delivered_at: true,
      failed_reason: true,
      created_at: true,
    },
  })

  return c.json({ success: true, data: logs })
})

export { router as notificationsRouter }
