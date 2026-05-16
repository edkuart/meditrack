import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { BackgroundCategory, UpsertBackgroundSchema } from './patient-background.schema.ts'
import * as backgroundService from './patient-background.service.ts'

const router = new Hono()

router.use('*', requireAuth)

// GET /patients/:patientId/background/history
router.get('/patients/:patientId/background/history', async (c) => {
  const auth = c.get('auth')
  const list = await backgroundService.getPatientBackgroundHistory(auth.tenant_id, c.req.param('patientId'))
  return c.json({ success: true, data: list })
})

// GET /patients/:patientId/background
router.get('/patients/:patientId/background', async (c) => {
  const auth = c.get('auth')
  const list = await backgroundService.getPatientBackground(auth.tenant_id, c.req.param('patientId'))
  return c.json({ success: true, data: list })
})

// PUT /patients/:patientId/background  — upsert por categoría
router.put('/patients/:patientId/background', zValidator('json', UpsertBackgroundSchema), async (c) => {
  const auth = c.get('auth')
  const record = await backgroundService.upsertBackground(
    auth.tenant_id,
    c.req.param('patientId'),
    auth.sub,
    auth.email,
    c.req.valid('json'),
  )
  return c.json({ success: true, data: record })
})

// DELETE /patients/:patientId/background/:category — retire active block, keep history
router.delete('/patients/:patientId/background/:category', async (c) => {
  const auth = c.get('auth')
  const category = BackgroundCategory.parse(c.req.param('category'))
  const record = await backgroundService.retireBackground(
    auth.tenant_id,
    c.req.param('patientId'),
    auth.sub,
    auth.email,
    category,
  )
  return c.json({ success: true, data: record })
})

export { router as patientBackgroundRouter }
