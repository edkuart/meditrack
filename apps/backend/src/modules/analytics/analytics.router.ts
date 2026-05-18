import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware.ts'
import { NotFoundError } from '../../shared/errors.ts'
import { db, patients } from '../../shared/db/index.ts'
import {
  getClinicSummary,
  getPatientAdherenceReport,
  getClinicTrends,
  getAdherenceCohorts,
  buildPatientsCsv,
  getDoseAlert,
  getNewPatientsAlert,
  getActiveTreatmentsAlert,
} from './analytics.service.ts'

const router = new Hono()

// ─── Clinic summary ───────────────────────────────────────────────────────────

router.get('/analytics/clinic', requireAuth, async (c) => {
  const { tenant_id, sub } = c.get('auth')
  const data = await getClinicSummary(tenant_id, sub)
  return c.json({ success: true, data })
})

// ─── Weekly KPI trends (admin) ────────────────────────────────────────────────

router.get('/analytics/clinic/trends', requireAuth, requireRole('ADMIN_CLINIC', 'SUPER_ADMIN'), async (c) => {
  const { tenant_id } = c.get('auth')
  const weeks = Math.min(52, Math.max(4, Number(c.req.query('weeks') ?? '12')))
  const data = await getClinicTrends(tenant_id, weeks)
  return c.json({ success: true, data })
})

// ─── Adherence cohorts (admin) ────────────────────────────────────────────────

router.get('/analytics/clinic/cohorts', requireAuth, requireRole('ADMIN_CLINIC', 'SUPER_ADMIN'), async (c) => {
  const { tenant_id } = c.get('auth')
  const period = Math.min(90, Math.max(7, Number(c.req.query('period') ?? '30')))
  const data = await getAdherenceCohorts(tenant_id, period)
  return c.json({ success: true, data })
})

// ─── CSV export of patients (admin) ──────────────────────────────────────────

router.get('/analytics/export/patients', requireAuth, requireRole('ADMIN_CLINIC', 'SUPER_ADMIN'), async (c) => {
  const { tenant_id } = c.get('auth')
  const csv = await buildPatientsCsv(tenant_id)
  const date = new Date().toISOString().substring(0, 10)

  c.header('Content-Type', 'text/csv; charset=utf-8')
  c.header('Content-Disposition', `attachment; filename="patients-${date}.csv"`)
  return c.text(csv)
})

// ─── Priority alert drill-downs (doctor + admin) ─────────────────────────────

router.get('/analytics/clinic/alerts/pending-doses', requireAuth, async (c) => {
  const { tenant_id } = c.get('auth')
  const data = await getDoseAlert(tenant_id, 'PENDING')
  return c.json({ success: true, data })
})

router.get('/analytics/clinic/alerts/missed-doses', requireAuth, async (c) => {
  const { tenant_id } = c.get('auth')
  const data = await getDoseAlert(tenant_id, 'MISSED')
  return c.json({ success: true, data })
})

router.get('/analytics/clinic/alerts/new-patients', requireAuth, async (c) => {
  const { tenant_id } = c.get('auth')
  const data = await getNewPatientsAlert(tenant_id)
  return c.json({ success: true, data })
})

router.get('/analytics/clinic/alerts/active-treatments', requireAuth, async (c) => {
  const { tenant_id } = c.get('auth')
  const data = await getActiveTreatmentsAlert(tenant_id)
  return c.json({ success: true, data })
})

// ─── Per-patient adherence ────────────────────────────────────────────────────

router.get('/analytics/patients/:id/adherence', requireAuth, async (c) => {
  const { tenant_id } = c.get('auth')
  const patientId = c.req.param('id')!
  const period = Math.min(90, Math.max(7, Number(c.req.query('period') ?? '30')))

  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.id, patientId), eq(patients.tenant_id, tenant_id)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  const data = await getPatientAdherenceReport(patientId, period)
  return c.json({ success: true, data })
})

export { router as analyticsRouter }
