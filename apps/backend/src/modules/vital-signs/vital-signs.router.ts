import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { PERMISSIONS, requirePermission } from '../../shared/permissions.ts'
import { CreatePatientVitalSignsSchema, CreateVitalSignsSchema } from './vital-signs.schema.ts'
import * as vitalSignsService from './vital-signs.service.ts'

const router = new Hono()

router.use('*', requireAuth)

// POST /encounters/:encounterId/vital-signs
router.post('/encounters/:encounterId/vital-signs', requirePermission(PERMISSIONS.VITALS_WRITE), zValidator('json', CreateVitalSignsSchema), async (c) => {
  const auth = c.get('auth')
  const record = await vitalSignsService.recordVitalSigns(
    auth.tenant_id,
    c.req.param('encounterId'),
    auth.sub,
    c.req.valid('json'),
  )
  return c.json({ success: true, data: record }, 201)
})

// GET /encounters/:encounterId/vital-signs
router.get('/encounters/:encounterId/vital-signs', requirePermission(PERMISSIONS.VITALS_READ), async (c) => {
  const auth = c.get('auth')
  const list = await vitalSignsService.getEncounterVitalSigns(auth.tenant_id, c.req.param('encounterId')!)
  return c.json({ success: true, data: list })
})

// GET /patients/:patientId/vital-signs
router.get('/patients/:patientId/vital-signs', requirePermission(PERMISSIONS.VITALS_READ), async (c) => {
  const auth = c.get('auth')
  const list = await vitalSignsService.getPatientVitalHistory(auth.tenant_id, c.req.param('patientId')!)
  return c.json({ success: true, data: list })
})

// POST /patients/:patientId/vital-signs
router.post('/patients/:patientId/vital-signs', requirePermission(PERMISSIONS.VITALS_WRITE), zValidator('json', CreatePatientVitalSignsSchema), async (c) => {
  const auth = c.get('auth')
  const record = await vitalSignsService.recordPatientVitalSigns(
    auth.tenant_id,
    c.req.param('patientId'),
    auth.sub,
    c.req.valid('json'),
  )
  return c.json({ success: true, data: record }, 201)
})

export { router as vitalSignsRouter }
