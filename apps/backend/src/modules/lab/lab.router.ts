import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { CreateLabOrderSchema, UpdateLabOrderSchema, UpsertLabResultsSchema } from './lab.schema.ts'
import * as labService from './lab.service.ts'

const router = new Hono()
router.use('*', requireAuth)

// GET /lab/orders — all orders for tenant (with optional ?patient_id=)
router.get('/lab/orders', async (c) => {
  const auth = c.get('auth')
  const patientId = c.req.query('patient_id')
  const orders = await labService.listLabOrders(auth.tenant_id, patientId)
  return c.json({ success: true, data: orders })
})

// POST /lab/orders
router.post('/lab/orders', zValidator('json', CreateLabOrderSchema), async (c) => {
  const auth = c.get('auth')
  const order = await labService.createLabOrder(
    auth.tenant_id,
    auth.sub,
    auth.email,
    c.req.valid('json'),
  )
  return c.json({ success: true, data: order }, 201)
})

// GET /lab/orders/:id
router.get('/lab/orders/:id', async (c) => {
  const auth = c.get('auth')
  const order = await labService.getLabOrder(auth.tenant_id, c.req.param('id'))
  return c.json({ success: true, data: order })
})

// PATCH /lab/orders/:id
router.patch('/lab/orders/:id', zValidator('json', UpdateLabOrderSchema), async (c) => {
  const auth = c.get('auth')
  const order = await labService.updateLabOrder(
    auth.tenant_id,
    c.req.param('id'),
    auth.sub,
    auth.email,
    c.req.valid('json'),
  )
  return c.json({ success: true, data: order })
})

// PUT /lab/orders/:id/results — replace all results
router.put('/lab/orders/:id/results', zValidator('json', UpsertLabResultsSchema), async (c) => {
  const auth = c.get('auth')
  const order = await labService.upsertLabResults(
    auth.tenant_id,
    c.req.param('id'),
    auth.sub,
    auth.email,
    c.req.valid('json'),
  )
  return c.json({ success: true, data: order })
})

export { router as labRouter }
