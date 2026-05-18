import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware.ts'
import { CreateLocationSchema, UpdateLocationSchema } from './locations.schema.ts'
import * as locationsService from './locations.service.ts'

const router = new Hono()

router.use('*', requireAuth)

router.get('/locations', async (c) => {
  const { tenant_id } = c.get('auth')
  const data = await locationsService.listLocations(tenant_id)
  return c.json({ success: true, data })
})

router.get('/locations/:id', async (c) => {
  const { tenant_id } = c.get('auth')
  const data = await locationsService.getLocation(tenant_id, c.req.param('id')!)
  return c.json({ success: true, data })
})

router.post(
  '/locations',
  requireRole('ADMIN_CLINIC'),
  zValidator('json', CreateLocationSchema),
  async (c) => {
    const { tenant_id } = c.get('auth')
    const data = await locationsService.createLocation(tenant_id, c.req.valid('json'))
    return c.json({ success: true, data }, 201)
  },
)

router.patch(
  '/locations/:id',
  requireRole('ADMIN_CLINIC'),
  zValidator('json', UpdateLocationSchema),
  async (c) => {
    const { tenant_id } = c.get('auth')
    const data = await locationsService.updateLocation(tenant_id, c.req.param('id')!, c.req.valid('json'))
    return c.json({ success: true, data })
  },
)

router.delete('/locations/:id', requireRole('ADMIN_CLINIC'), async (c) => {
  const { tenant_id } = c.get('auth')
  await locationsService.deactivateLocation(tenant_id, c.req.param('id')!)
  return c.json({ success: true, data: null })
})

export { router as locationsRouter }
