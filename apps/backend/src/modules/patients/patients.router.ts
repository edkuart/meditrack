import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { PERMISSIONS, requirePermission } from '../../shared/permissions.ts'
import { CreatePatientSchema, UpdatePatientSchema, SearchPatientsSchema } from './patients.schema.ts'
import * as patientsService from './patients.service.ts'

const router = new Hono()

router.use('*', requireAuth)

// GET /patients?q=garcia&page=1&limit=20
router.get('/', requirePermission(PERMISSIONS.PATIENT_READ), zValidator('query', SearchPatientsSchema), async (c) => {
  const auth = c.get('auth')
  const query = c.req.valid('query')

  await import('../../shared/services/audit.service.ts').then(({ createAuditLog }) =>
    createAuditLog({
      tenant_id: auth.tenant_id,
      actor_id: auth.sub,
      actor_type: 'USER',
      actor_email: auth.email,
      action: 'PATIENT_SEARCHED',
      resource_type: 'PATIENT',
      context: { q: query.q },
    }),
  )

  const result = await patientsService.searchPatients(auth.tenant_id, query)
  return c.json({ success: true, data: result })
})

// POST /patients
router.post('/', requirePermission(PERMISSIONS.PATIENT_WRITE), zValidator('json', CreatePatientSchema), async (c) => {
  const auth = c.get('auth')
  const body = c.req.valid('json')
  const patient = await patientsService.createPatient(auth.tenant_id, auth.sub, auth.email, body)
  return c.json({ success: true, data: patient }, 201)
})

// GET /patients/:id/check-ins
router.get('/:id/check-ins', requirePermission(PERMISSIONS.TREATMENT_ADHERENCE_READ), async (c) => {
  const auth = c.get('auth')
  const limitParam = Number(c.req.query('limit') ?? 14)
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 60) : 14
  const checkIns = await patientsService.listPatientCheckIns(auth.tenant_id, c.req.param('id')!, limit)
  return c.json({ success: true, data: checkIns })
})

// GET /patients/:id/clinical-workspace
router.get('/:id/clinical-workspace', requirePermission(PERMISSIONS.PATIENT_SENSITIVE_READ), async (c) => {
  const auth = c.get('auth')
  const workspace = await patientsService.getPatientClinicalWorkspace(
    auth.tenant_id,
    c.req.param('id')!,
    auth.sub,
    auth.email,
  )
  return c.json({ success: true, data: workspace })
})

// GET /patients/:id
router.get('/:id', requirePermission(PERMISSIONS.PATIENT_READ), async (c) => {
  const auth = c.get('auth')
  const patient = await patientsService.getPatientById(
    auth.tenant_id,
    c.req.param('id')!,
    auth.sub,
    auth.email,
    auth.permissions?.includes(PERMISSIONS.PATIENT_SENSITIVE_READ) ?? false,
  )
  return c.json({ success: true, data: patient })
})

// PATCH /patients/:id
router.patch('/:id', requirePermission(PERMISSIONS.PATIENT_WRITE), zValidator('json', UpdatePatientSchema), async (c) => {
  const auth = c.get('auth')
  const body = c.req.valid('json')
  const patient = await patientsService.updatePatient(
    auth.tenant_id,
    c.req.param('id'),
    auth.sub,
    auth.email,
    body,
  )
  return c.json({ success: true, data: patient })
})

// DELETE /patients/:id  (soft delete — deactivate only)
router.delete('/:id', requirePermission(PERMISSIONS.PATIENT_WRITE), async (c) => {
  const auth = c.get('auth')
  await patientsService.deactivatePatient(auth.tenant_id, c.req.param('id')!, auth.sub, auth.email)
  return c.json({ success: true, data: null })
})

export { router as patientsRouter }
