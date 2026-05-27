import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { PERMISSIONS, requirePermission } from '../../shared/permissions.ts'
import { requireTenantCapability } from '../../shared/services/limits.service.ts'
import { AdmitPatientSchema, DischargePatientSchema } from './admissions.schema.ts'
import * as svc from './admissions.service.ts'

const router = new Hono()

router.use('*', requireAuth)
router.use('*', async (c, next) => {
  const { tenant_id } = c.get('auth')
  await requireTenantCapability(tenant_id, 'hospital.census', 'El censo hospitalario está disponible en Clínica Completa.')
  await next()
})

// ─── Census ───────────────────────────────────────────────────────────────────

router.get('/hospital/census', requirePermission(PERMISSIONS.HOSPITAL_CENSUS_READ), async (c) => {
  const { tenant_id } = c.get('auth')
  const data = await svc.getHospitalCensus(tenant_id)
  return c.json({ success: true, data })
})

// ─── Per-patient admissions ───────────────────────────────────────────────────

router.get('/patients/:patientId/admissions', requirePermission(PERMISSIONS.HOSPITAL_CENSUS_READ), async (c) => {
  const { tenant_id } = c.get('auth')
  const data = await svc.listPatientAdmissions(tenant_id, c.req.param('patientId')!)
  return c.json({ success: true, data })
})

router.post(
  '/patients/:patientId/admissions',
  requirePermission(PERMISSIONS.ADMISSION_WRITE),
  zValidator('json', AdmitPatientSchema),
  async (c) => {
    const { tenant_id, sub, email } = c.get('auth')
    const data = await svc.admitPatient(tenant_id, sub, email, c.req.param('patientId')!, c.req.valid('json'))
    return c.json({ success: true, data }, 201)
  },
)

// ─── Discharge ────────────────────────────────────────────────────────────────

router.post(
  '/admissions/:id/discharge',
  requirePermission(PERMISSIONS.ADMISSION_WRITE),
  zValidator('json', DischargePatientSchema),
  async (c) => {
    const { tenant_id, sub, email } = c.get('auth')
    const data = await svc.dischargePatient(tenant_id, sub, email, c.req.param('id')!, c.req.valid('json'))
    return c.json({ success: true, data })
  },
)

export { router as admissionsRouter }
