import { eq, and, count } from 'drizzle-orm'
import { createHmac, timingSafeEqual } from 'crypto'
import { db, tenants, patients, users } from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { PLAN_LIMITS } from '../../shared/services/limits.service.ts'
import { AppError } from '../../shared/errors.ts'
import { config } from '../../shared/config.ts'
import { getAiUsageStatus } from '../ai-usage/ai-usage.service.ts'

const STRIPE_API = 'https://api.stripe.com/v1'

// ─── Stripe HTTP helpers ───────────────────────────────────────────────────────

async function stripePost<T = Record<string, unknown>>(
  path: string,
  body: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.stripe.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  })
  const json = await res.json() as { error?: { message: string } } & T
  if (!res.ok) throw new AppError(502, 'STRIPE_ERROR', json.error?.message ?? 'Stripe request failed')
  return json
}

async function stripeGet<T = Record<string, unknown>>(path: string): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${config.stripe.secretKey}` },
  })
  const json = await res.json() as { error?: { message: string } } & T
  if (!res.ok) throw new AppError(502, 'STRIPE_ERROR', json.error?.message ?? 'Stripe request failed')
  return json
}

// ─── Ensure Stripe customer exists for tenant ─────────────────────────────────

async function ensureStripeCustomer(tenantId: string): Promise<string> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { stripe_customer_id: true, name: true, slug: true },
  })
  if (!tenant) throw new AppError(404, 'NOT_FOUND', 'Tenant not found')

  if (tenant.stripe_customer_id) return tenant.stripe_customer_id

  const customer = await stripePost<{ id: string }>('/customers', {
    name: tenant.name,
    'metadata[tenant_id]': tenantId,
    'metadata[slug]': tenant.slug,
  })

  await db.update(tenants)
    .set({ stripe_customer_id: customer.id, updated_at: new Date() })
    .where(eq(tenants.id, tenantId))

  return customer.id
}

// ─── Billing status ───────────────────────────────────────────────────────────

export async function getBillingStatus(tenantId: string) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: {
      plan_type: true,
      stripe_subscription_id: true,
      subscription_current_period_end: true,
    },
  })
  if (!tenant) throw new AppError(404, 'NOT_FOUND', 'Tenant not found')

  const plan = tenant.plan_type as keyof typeof PLAN_LIMITS
  const limits = PLAN_LIMITS[plan]

  const [[{ value: patientCount }], [{ value: staffCount }], aiUsage] = await Promise.all([
    db.select({ value: count() }).from(patients)
      .where(and(eq(patients.tenant_id, tenantId), eq(patients.is_active, true))),
    db.select({ value: count() }).from(users)
      .where(and(eq(users.tenant_id, tenantId), eq(users.is_active, true))),
    getAiUsageStatus(tenantId),
  ])

  return {
    plan,
    limits: {
      max_patients: limits.max_patients,
      max_staff: limits.max_staff,
      max_ai_units_monthly: limits.max_ai_units_monthly,
    },
    usage: {
      patients: patientCount,
      staff: staffCount,
      ai_units_monthly: aiUsage.used,
      ai_units_remaining: aiUsage.remaining,
      ai_period_starts_at: aiUsage.period.starts_at,
    },
    subscription: tenant.stripe_subscription_id
      ? { id: tenant.stripe_subscription_id, current_period_end: tenant.subscription_current_period_end }
      : null,
  }
}

// ─── Create checkout session (upgrade to Pro) ─────────────────────────────────

export async function createCheckoutSession(
  tenantId: string,
  actorId: string,
  actorEmail: string,
): Promise<{ url: string }> {
  if (!config.stripe.secretKey) throw new AppError(503, 'BILLING_UNAVAILABLE', 'Billing not configured')

  const customerId = await ensureStripeCustomer(tenantId)

  const session = await stripePost<{ url: string }>('/checkout/sessions', {
    'customer': customerId,
    'mode': 'subscription',
    'line_items[0][price]': config.stripe.proPriceId,
    'line_items[0][quantity]': '1',
    'success_url': `${config.frontendUrl}/settings/billing?upgraded=true`,
    'cancel_url': `${config.frontendUrl}/settings/billing?cancelled=true`,
    'metadata[tenant_id]': tenantId,
    'subscription_data[metadata][tenant_id]': tenantId,
  })

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'BILLING_CHECKOUT_STARTED',
    resource_type: 'TENANT',
    resource_id: tenantId,
  })

  return { url: session.url }
}

// ─── Create billing portal session (manage subscription) ─────────────────────

export async function createPortalSession(tenantId: string): Promise<{ url: string }> {
  if (!config.stripe.secretKey) throw new AppError(503, 'BILLING_UNAVAILABLE', 'Billing not configured')

  const customerId = await ensureStripeCustomer(tenantId)

  const session = await stripePost<{ url: string }>('/billing_portal/sessions', {
    customer: customerId,
    return_url: `${config.frontendUrl}/settings/billing`,
  })

  return { url: session.url }
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

interface StripeSubscription {
  id: string
  status: string
  current_period_end: number
  metadata: Record<string, string>
  items: { data: Array<{ price: { product: string } }> }
}

interface StripeCheckoutSession {
  metadata: Record<string, string>
  subscription: string | null
}

// Exported for unit testing — pure function, no side effects
export function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string): void {
  const parts = signatureHeader.split(',')
  const tPart = parts.find(p => p.startsWith('t='))
  const v1Part = parts.find(p => p.startsWith('v1='))
  if (!tPart || !v1Part) throw new AppError(400, 'INVALID_SIGNATURE', 'Missing signature parts')

  const timestamp = tPart.slice(2)
  const expectedSig = v1Part.slice(3)
  const payload = `${timestamp}.${rawBody}`

  const mac = createHmac('sha256', secret).update(payload).digest('hex')
  const macBuf = Buffer.from(mac, 'hex')
  const expectedBuf = Buffer.from(expectedSig, 'hex')

  if (macBuf.length !== expectedBuf.length || !timingSafeEqual(macBuf, expectedBuf)) {
    throw new AppError(400, 'INVALID_SIGNATURE', 'Webhook signature verification failed')
  }

  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    throw new AppError(400, 'STALE_EVENT', 'Webhook event is too old')
  }
}

export async function handleWebhook(rawBody: string, signatureHeader: string): Promise<void> {
  if (!config.stripe.webhookSecret) return

  verifyStripeSignature(rawBody, signatureHeader, config.stripe.webhookSecret)

  const event = JSON.parse(rawBody) as { type: string; data: { object: unknown } }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as StripeCheckoutSession
    const tenantId = session.metadata?.tenant_id
    if (!tenantId || !session.subscription) return

    const sub = await stripeGet<StripeSubscription>(`/subscriptions/${session.subscription}`)
    await applySubscriptionUpdate(tenantId, sub)
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as StripeSubscription
    const tenantId = sub.metadata?.tenant_id
    if (!tenantId) return
    await applySubscriptionUpdate(tenantId, sub, event.type === 'customer.subscription.deleted')
  }
}

async function applySubscriptionUpdate(
  tenantId: string,
  sub: StripeSubscription,
  deleted = false,
): Promise<void> {
  const newPlan = deleted || sub.status === 'canceled' ? 'free' : 'pro'
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null

  await db.update(tenants)
    .set({
      plan_type: newPlan,
      stripe_subscription_id: deleted ? null : sub.id,
      subscription_current_period_end: periodEnd,
      updated_at: new Date(),
    })
    .where(eq(tenants.id, tenantId))
}
