import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { NotFoundError } from '../../shared/errors.ts'
import { db, patients } from '../../shared/db/index.ts'
import { getClinicSummary, getPatientAdherenceReport } from './analytics.service.ts'

const router = new Hono()

router.get('/analytics/clinic', requireAuth, async (c) => {
  const auth = c.get('auth')
  const data = await getClinicSummary(auth.tenant_id)
  return c.json({ success: true, data })
})

router.get('/analytics/patients/:id/adherence', requireAuth, async (c) => {
  const auth = c.get('auth')
  const patientId = c.req.param('id')!
  const period = Math.min(90, Math.max(7, Number(c.req.query('period') ?? '30')))

  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.id, patientId), eq(patients.tenant_id, auth.tenant_id)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  const data = await getPatientAdherenceReport(patientId, period)
  return c.json({ success: true, data })
})

export { router as analyticsRouter }
