import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware.ts'
import { UpdateExtractedValueSchema } from './lab-external.schema.ts'
import * as service from './lab-external.service.ts'

const router = new Hono()
router.use('*', requireAuth)

// GET /lab/external-submissions — list for tenant (pending review first)
router.get('/lab/external-submissions', async (c) => {
  const auth = c.get('auth')
  const status   = c.req.query('status')   ?? undefined
  const order_id = c.req.query('order_id') ?? undefined
  const data = await service.listSubmissions(auth.tenant_id, status, order_id)
  return c.json({ success: true, data })
})

// GET /lab/external-submissions/:id — detail with files + extracted values
router.get('/lab/external-submissions/:id', async (c) => {
  const auth = c.get('auth')
  const data = await service.getSubmission(auth.tenant_id, c.req.param('id'))
  return c.json({ success: true, data })
})

// POST /lab/external-submissions/:id/extract — trigger AI extraction
router.post('/lab/external-submissions/:id/extract',
  requireRole('DOCTOR', 'ADMIN_CLINIC', 'LAB_TECHNICIAN'),
  async (c) => {
    const auth = c.get('auth')
    const data = await service.triggerAiExtraction(
      auth.tenant_id,
      c.req.param('id')!,
      auth.sub,
      auth.email,
    )
    return c.json({ success: true, data })
  },
)

// PATCH /lab/external-submissions/:id/values/:valueId — accept / edit / reject one value
router.patch('/lab/external-submissions/:id/values/:valueId',
  requireRole('DOCTOR', 'ADMIN_CLINIC'),
  zValidator('json', UpdateExtractedValueSchema),
  async (c) => {
    const auth = c.get('auth')
    const data = await service.updateExtractedValue(
      auth.tenant_id,
      c.req.param('id'),
      c.req.param('valueId'),
      c.req.valid('json'),
    )
    return c.json({ success: true, data })
  },
)

// POST /lab/external-submissions/:id/validate — merge validated values into lab_results
router.post('/lab/external-submissions/:id/validate',
  requireRole('DOCTOR', 'ADMIN_CLINIC'),
  async (c) => {
    const auth = c.get('auth')
    const data = await service.validateSubmission(
      auth.tenant_id,
      c.req.param('id')!,
      auth.sub,
      auth.email,
    )
    return c.json({ success: true, data })
  },
)

export { router as labExternalRouter }
