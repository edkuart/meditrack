import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { CreateEncounterSchema, UpdateEncounterSchema, CloseEncounterSchema } from './encounters.schema.ts'
import * as encountersService from './encounters.service.ts'

const router = new Hono()

router.use('*', requireAuth)

// GET /patients/:patientId/encounters
router.get('/patients/:patientId/encounters', async (c) => {
  const auth = c.get('auth')
  const list = await encountersService.listPatientEncounters(auth.tenant_id, c.req.param('patientId'))
  return c.json({ success: true, data: list })
})

// POST /patients/:patientId/encounters
router.post(
  '/patients/:patientId/encounters',
  zValidator('json', CreateEncounterSchema),
  async (c) => {
    const auth = c.get('auth')
    const encounter = await encountersService.createEncounter(
      auth.tenant_id,
      auth.sub,
      auth.email,
      c.req.param('patientId'),
      c.req.valid('json'),
    )
    return c.json({ success: true, data: encounter }, 201)
  },
)

// GET /encounters/:id
router.get('/encounters/:id', async (c) => {
  const auth = c.get('auth')
  const encounter = await encountersService.getEncounterById(auth.tenant_id, c.req.param('id'))
  return c.json({ success: true, data: encounter })
})

// PATCH /encounters/:id
router.patch('/encounters/:id', zValidator('json', UpdateEncounterSchema), async (c) => {
  const auth = c.get('auth')
  const encounter = await encountersService.updateEncounter(
    auth.tenant_id,
    c.req.param('id'),
    auth.sub,
    auth.email,
    c.req.valid('json'),
  )
  return c.json({ success: true, data: encounter })
})

// POST /encounters/:id/close
router.post('/encounters/:id/close', zValidator('json', CloseEncounterSchema), async (c) => {
  const auth = c.get('auth')
  const encounter = await encountersService.closeEncounter(
    auth.tenant_id,
    c.req.param('id'),
    auth.sub,
    auth.email,
    c.req.valid('json'),
  )
  return c.json({ success: true, data: encounter })
})

export { router as encountersRouter }
