import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { PERMISSIONS, requirePermission } from '../../shared/permissions.ts'
import { CreateLabOrderSchema, UpdateLabOrderSchema, UpsertLabResultsSchema } from './lab.schema.ts'
import * as labService from './lab.service.ts'

const router = new Hono()
router.use('*', requireAuth)

// GET /lab/orders — all authenticated roles
router.get('/lab/orders', requirePermission(PERMISSIONS.LAB_ORDER_READ), async (c) => {
  const auth = c.get('auth')
  const patientId = c.req.query('patient_id')
  const orders = await labService.listLabOrders(auth.tenant_id, patientId)
  return c.json({ success: true, data: orders })
})

// POST /lab/orders — clinical staff that creates orders (not lab tech)
router.post('/lab/orders',
  requirePermission(PERMISSIONS.LAB_ORDER_WRITE),
  zValidator('json', CreateLabOrderSchema),
  async (c) => {
    const auth = c.get('auth')
    const order = await labService.createLabOrder(
      auth.tenant_id,
      auth.sub,
      auth.email,
      c.req.valid('json'),
    )
    return c.json({ success: true, data: order }, 201)
  },
)

// GET /lab/orders/:id — all authenticated roles
router.get('/lab/orders/:id', requirePermission(PERMISSIONS.LAB_ORDER_READ), async (c) => {
  const auth = c.get('auth')
  const order = await labService.getLabOrder(auth.tenant_id, c.req.param('id')!)
  return c.json({ success: true, data: order })
})

// PATCH /lab/orders/:id — all authenticated roles (cancel, notes)
router.patch('/lab/orders/:id', requirePermission(PERMISSIONS.LAB_ORDER_WRITE), zValidator('json', UpdateLabOrderSchema), async (c) => {
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

// PUT /lab/orders/:id/results — only lab technician and admin
router.put('/lab/orders/:id/results',
  requirePermission(PERMISSIONS.LAB_RESULT_WRITE),
  zValidator('json', UpsertLabResultsSchema),
  async (c) => {
    const auth = c.get('auth')
    const order = await labService.upsertLabResults(
      auth.tenant_id,
      c.req.param('id'),
      auth.sub,
      auth.email,
      c.req.valid('json'),
    )
    return c.json({ success: true, data: order })
  },
)

export { router as labRouter }
