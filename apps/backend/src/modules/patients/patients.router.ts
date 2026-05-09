import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { CreatePatientSchema, UpdatePatientSchema, SearchPatientsSchema } from './patients.schema.ts'
import * as patientsService from './patients.service.ts'

const router = new Hono()

router.use('*', requireAuth)

// GET /patients?q=garcia&page=1&limit=20
router.get('/', zValidator('query', SearchPatientsSchema), async (c) => {
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
router.post('/', zValidator('json', CreatePatientSchema), async (c) => {
  const auth = c.get('auth')
  const body = c.req.valid('json')
  const patient = await patientsService.createPatient(auth.tenant_id, auth.sub, auth.email, body)
  return c.json({ success: true, data: patient }, 201)
})

// GET /patients/:id
router.get('/:id', async (c) => {
  const auth = c.get('auth')
  const patient = await patientsService.getPatientById(
    auth.tenant_id,
    c.req.param('id'),
    auth.sub,
    auth.email,
  )
  return c.json({ success: true, data: patient })
})

// PATCH /patients/:id
router.patch('/:id', zValidator('json', UpdatePatientSchema), async (c) => {
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
router.delete('/:id', async (c) => {
  const auth = c.get('auth')
  await patientsService.deactivatePatient(auth.tenant_id, c.req.param('id'), auth.sub, auth.email)
  return c.json({ success: true, data: null })
})

export { router as patientsRouter }
