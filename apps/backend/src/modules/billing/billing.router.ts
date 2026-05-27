import { Hono } from 'hono'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { PERMISSIONS, requirePermission } from '../../shared/permissions.ts'
import {
  COMMERCIAL_PLANS,
  getBillingStatus,
  getInvoices,
  getInvoice,
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  handleRecurrenteWebhook,
  type CommercialPlan,
  type PaymentProvider,
} from './billing.service.ts'

export const billingRouter = new Hono()

billingRouter.get('/billing/status', requireAuth, requirePermission(PERMISSIONS.HOSPITAL_MANAGE), async (c) => {
  const { tenant_id } = c.get('auth')
  const status = await getBillingStatus(tenant_id)
  return c.json({ success: true, data: status })
})

billingRouter.post('/billing/checkout', requireAuth, requirePermission(PERMISSIONS.HOSPITAL_MANAGE), async (c) => {
  const { tenant_id, sub, email } = c.get('auth')
  const body = await c.req.json().catch(() => ({})) as { plan?: string, provider?: string }
  const plan = COMMERCIAL_PLANS.includes(body.plan as CommercialPlan)
    ? body.plan as CommercialPlan
    : 'doctor_individual'
  const provider = body.provider === 'stripe' || body.provider === 'recurrente'
    ? body.provider as PaymentProvider
    : undefined
  const result = await createCheckoutSession(tenant_id, sub, email, plan, provider)
  return c.json({ success: true, data: result })
})

billingRouter.post('/billing/portal', requireAuth, requirePermission(PERMISSIONS.HOSPITAL_MANAGE), async (c) => {
  const { tenant_id } = c.get('auth')
  const result = await createPortalSession(tenant_id)
  return c.json({ success: true, data: result })
})

billingRouter.get('/billing/invoices', requireAuth, requirePermission(PERMISSIONS.HOSPITAL_MANAGE), async (c) => {
  const { tenant_id } = c.get('auth')
  const page = Number(c.req.query('page') ?? '1')
  const pageSize = Math.min(Number(c.req.query('pageSize') ?? '20'), 100)
  const result = await getInvoices(tenant_id, page, pageSize)
  return c.json({ success: true, data: result })
})

billingRouter.get('/billing/invoices/:id', requireAuth, requirePermission(PERMISSIONS.HOSPITAL_MANAGE), async (c) => {
  const { tenant_id } = c.get('auth')
  const invoiceId = c.req.param('id') ?? ''
  const invoice = await getInvoice(tenant_id, invoiceId)
  return c.json({ success: true, data: invoice })
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

stripeWebhookRouter.post('/billing/webhook/recurrente', async (c) => {
  const rawBody = await c.req.text()

  try {
    await handleRecurrenteWebhook(rawBody, {
      'svix-id': c.req.header('svix-id'),
      'svix-timestamp': c.req.header('svix-timestamp'),
      'svix-signature': c.req.header('svix-signature'),
    })
    return c.json({ success: true, data: { received: true } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook error'
    return c.json({ success: false, error: { code: 'WEBHOOK_ERROR', message } }, 400)
  }
})
