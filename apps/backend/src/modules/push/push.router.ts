import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { saveSubscription, removeSubscription, getVapidPublicKey } from '../../shared/services/push.service.ts'

const router = new Hono()

const SubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth:   z.string().min(1),
  }),
})

// Get VAPID public key (no auth required — needed before subscribing)
router.get('/push/vapid-public-key', (c) => {
  const key = getVapidPublicKey()
  if (!key) return c.json({ success: false, error: { code: 'NOT_CONFIGURED', message: 'Push notifications not configured' } }, 503)
  return c.json({ success: true, data: { public_key: key } })
})

// Save browser push subscription
router.post('/push/subscribe', requireAuth, zValidator('json', SubscribeSchema), async (c) => {
  const auth = c.get('auth')
  const body = c.req.valid('json')
  const userAgent = c.req.header('user-agent')?.slice(0, 300)

  await saveSubscription(auth.sub, auth.tenant_id, body.endpoint, body.keys.p256dh, body.keys.auth, userAgent)
  return c.json({ success: true })
})

// Remove a browser push subscription
router.post('/push/unsubscribe', requireAuth, async (c) => {
  const auth = c.get('auth')
  const body = await c.req.json().catch(() => ({})) as { endpoint?: string }
  if (!body.endpoint) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'endpoint required' } }, 400)

  await removeSubscription(auth.sub, body.endpoint)
  return c.json({ success: true })
})

export { router as pushRouter }
