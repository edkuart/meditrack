import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { RecordAiUsageSchema } from './ai-usage.schema.ts'
import * as aiUsageService from './ai-usage.service.ts'

const router = new Hono()

router.use('*', requireAuth)

router.get('/ai-usage/status', async (c) => {
  const auth = c.get('auth')
  const status = await aiUsageService.getAiUsageStatus(auth.tenant_id)
  return c.json({ success: true, data: status })
})

router.get(
  '/ai-usage/events',
  zValidator('query', z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) })),
  async (c) => {
    const auth = c.get('auth')
    const rows = await aiUsageService.listAiUsageEvents(auth.tenant_id, c.req.valid('query').limit)
    return c.json({ success: true, data: rows })
  },
)

router.post('/ai-usage/events', zValidator('json', RecordAiUsageSchema), async (c) => {
  const auth = c.get('auth')
  const event = await aiUsageService.recordAiUsage(
    auth.tenant_id,
    auth.sub,
    auth.email,
    c.req.valid('json'),
  )
  return c.json({ success: true, data: event }, 201)
})

export { router as aiUsageRouter }
