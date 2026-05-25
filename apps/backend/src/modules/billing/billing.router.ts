import { Hono } from 'hono'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { PERMISSIONS, requirePermission } from '../../shared/permissions.ts'
import { getBillingStatus, createCheckoutSession, createPortalSession, handleWebhook } from './billing.service.ts'

export const billingRouter = new Hono()

billingRouter.get('/billing/status', requireAuth, requirePermission(PERMISSIONS.HOSPITAL_MANAGE), async (c) => {
  const { tenant_id } = c.get('auth')
  const status = await getBillingStatus(tenant_id)
  return c.json({ success: true, data: status })
})

billingRouter.post('/billing/checkout', requireAuth, requirePermission(PERMISSIONS.HOSPITAL_MANAGE), async (c) => {
  const { tenant_id, sub, email } = c.get('auth')
  const result = await createCheckoutSession(tenant_id, sub, email)
  return c.json({ success: true, data: result })
})

billingRouter.post('/billing/portal', requireAuth, requirePermission(PERMISSIONS.HOSPITAL_MANAGE), async (c) => {
  const { tenant_id } = c.get('auth')
  const result = await createPortalSession(tenant_id)
  return c.json({ success: true, data: result })
})

// Stripe webhook — public, no auth. Mounted separately in app.ts to avoid
// middleware bleed from the protected routes above.
export const stripeWebhookRouter = new Hono()

stripeWebhookRouter.post('/billing/webhook', async (c) => {
  const signature = c.req.header('stripe-signature')
  if (!signature) return c.json({ success: false, error: { code: 'MISSING_SIGNATURE' } }, 400)

  const rawBody = await c.req.text()

  try {
    await handleWebhook(rawBody, signature)
    return c.json({ success: true, data: { received: true } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook error'
    return c.json({ success: false, error: { code: 'WEBHOOK_ERROR', message } }, 400)
  }
})
