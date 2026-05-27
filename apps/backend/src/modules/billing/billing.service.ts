import { eq, and, count, desc, sql, ilike, or, gt, lte } from 'drizzle-orm'
import { createHmac, timingSafeEqual } from 'crypto'
import {
  db, tenants, patients, users,
  billingInvoices, billingInvoiceCounters, tenantAccessGrants,
} from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { getTenantEntitlements } from '../../shared/services/limits.service.ts'
import { AppError } from '../../shared/errors.ts'
import { config } from '../../shared/config.ts'
import { getAiUsageStatus } from '../ai-usage/ai-usage.service.ts'

const STRIPE_API = 'https://api.stripe.com/v1'
export const COMMERCIAL_PLANS = ['doctor_individual', 'clinic_complete'] as const
export type CommercialPlan = typeof COMMERCIAL_PLANS[number]
export const PAYMENT_PROVIDERS = ['recurrente', 'stripe'] as const
export type PaymentProvider = typeof PAYMENT_PROVIDERS[number]

const PLAN_PRICES_GTQ: Record<CommercialPlan, number> = {
  doctor_individual: 350,
  clinic_complete: 1200,
}

const STRIPE_PRICE_TO_PLAN = new Map<string, CommercialPlan>([
  [config.stripe.doctorIndividualPriceId, 'doctor_individual'],
  [config.stripe.proPriceId, 'doctor_individual'],
  [config.stripe.clinicCompletePriceId, 'clinic_complete'],
].filter(([priceId]) => Boolean(priceId)) as Array<[string, CommercialPlan]>)

function isCommercialPlan(value: unknown): value is CommercialPlan {
  return typeof value === 'string' && COMMERCIAL_PLANS.includes(value as CommercialPlan)
}

function isPaymentProvider(value: unknown): value is PaymentProvider {
  return typeof value === 'string' && PAYMENT_PROVIDERS.includes(value as PaymentProvider)
}

function getDefaultPaymentProvider(): PaymentProvider {
  return isPaymentProvider(config.payments.provider) ? config.payments.provider : 'recurrente'
}

function priceIdForPlan(plan: CommercialPlan): string {
  const priceId = plan === 'doctor_individual'
    ? config.stripe.doctorIndividualPriceId || config.stripe.proPriceId
    : config.stripe.clinicCompletePriceId

  if (!priceId) {
    throw new AppError(
      503,
      'BILLING_PLAN_UNAVAILABLE',
      `Stripe price ID not configured for ${plan}`,
    )
  }
  return priceId
}

function resolvePlanFromSubscription(sub: StripeSubscription, deleted = false): CommercialPlan | 'free' {
  if (deleted || sub.status === 'canceled') return 'free'
  if (isCommercialPlan(sub.metadata?.plan)) return sub.metadata.plan

  for (const item of sub.items?.data ?? []) {
    const priceId = item.price?.id
    const plan = STRIPE_PRICE_TO_PLAN.get(priceId)
    if (plan) return plan
  }

  return 'doctor_individual'
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

async function expireExpiredAccessGrantsForTenant(tenantId: string) {
  const now = new Date()
  await db.update(tenantAccessGrants)
    .set({ status: 'expired', updated_at: now })
    .where(and(
      eq(tenantAccessGrants.tenant_id, tenantId),
      eq(tenantAccessGrants.status, 'active'),
      lte(tenantAccessGrants.ends_at, now),
    ))
}

async function findActiveAccessGrant(tenantId: string) {
  const now = new Date()
  return db.query.tenantAccessGrants.findFirst({
    where: and(
      eq(tenantAccessGrants.tenant_id, tenantId),
      eq(tenantAccessGrants.status, 'active'),
      lte(tenantAccessGrants.starts_at, now),
      gt(tenantAccessGrants.ends_at, now),
    ),
    orderBy: [desc(tenantAccessGrants.ends_at)],
  })
}

// ─── Invoice number generator ─────────────────────────────────────────────────

async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const [row] = await db
    .insert(billingInvoiceCounters)
    .values({ year, next_number: 2 })
    .onConflictDoUpdate({
      target: billingInvoiceCounters.year,
      set: { next_number: sql`billing_invoice_counters.next_number + 1` },
    })
    .returning()
  const num = row.next_number - 1
  return `MT-${year}-${String(num).padStart(6, '0')}`
}

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

// ─── Recurrente HTTP helpers ─────────────────────────────────────────────────

async function recurrentePost<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const apiKey = config.payments.recurrente.secretKey || config.payments.recurrente.publicKey
  if (!apiKey) {
    throw new AppError(503, 'BILLING_UNAVAILABLE', 'Recurrente API key not configured')
  }
  const authHeader = config.payments.recurrente.secretKey ? 'X-SECRET-KEY' : 'X-PUBLIC-KEY'

  const res = await fetch(`${config.payments.recurrente.apiBase}${path}`, {
    method: 'POST',
    headers: {
      [authHeader]: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({})) as { message?: string, error?: string } & T
  if (!res.ok) {
    throw new AppError(
      502,
      'RECURRENTE_ERROR',
      json.message ?? json.error ?? `Recurrente request failed with HTTP ${res.status}`,
    )
  }
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
  await expireExpiredAccessGrantsForTenant(tenantId)

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: {
      plan_type: true,
      stripe_subscription_id: true,
      subscription_current_period_end: true,
    },
  })
  if (!tenant) throw new AppError(404, 'NOT_FOUND', 'Tenant not found')

  const entitlements = await getTenantEntitlements(tenantId)
  const now = new Date()
  const activeGrant = await findActiveAccessGrant(tenantId)
  const latestGrant = await db.query.tenantAccessGrants.findFirst({
    where: eq(tenantAccessGrants.tenant_id, tenantId),
    orderBy: [desc(tenantAccessGrants.created_at)],
  })
  const daysRemaining = activeGrant ? Math.ceil((activeGrant.ends_at.getTime() - now.getTime()) / 86_400_000) : null
  const trialStatus = activeGrant
    ? (daysRemaining !== null && daysRemaining <= 3 ? 'expiring' : 'active')
    : latestGrant?.status === 'expired'
      ? 'expired'
      : latestGrant?.status === 'converted'
        ? 'converted'
        : 'none'

  const [[{ value: patientCount }], [{ value: staffCount }], aiUsage] = await Promise.all([
    db.select({ value: count() }).from(patients)
      .where(and(eq(patients.tenant_id, tenantId), eq(patients.is_active, true))),
    db.select({ value: count() }).from(users)
      .where(and(eq(users.tenant_id, tenantId), eq(users.is_active, true))),
    getAiUsageStatus(tenantId),
  ])

  return {
    plan: entitlements.plan,
    base_plan: entitlements.base_plan,
    access_grant: entitlements.access_grant,
    commercial_state: {
      trial_status: trialStatus,
      days_remaining: daysRemaining,
      latest_grant_status: latestGrant?.status ?? null,
      latest_grant_ended_at: latestGrant?.ends_at ?? null,
    },
    limits: {
      max_organizations: entitlements.limits.max_organizations,
      max_patients: entitlements.limits.max_patients,
      max_staff: entitlements.limits.max_staff,
      max_ai_units_monthly: entitlements.limits.max_ai_units_monthly,
    },
    capabilities: entitlements.capabilities,
    usage: {
      patients: patientCount,
      staff: staffCount,
      ai_units_monthly: aiUsage.used,
      ai_units_remaining: aiUsage.remaining,
      ai_period_starts_at: aiUsage.period.starts_at,
    },
    subscription: tenant.stripe_subscription_id
      ? {
          id: tenant.stripe_subscription_id,
          provider: tenant.stripe_subscription_id.startsWith('recurrente:') ? 'recurrente' : 'stripe',
          current_period_end: tenant.subscription_current_period_end,
        }
      : null,
  }
}

// ─── Invoice list ─────────────────────────────────────────────────────────────

export async function getInvoices(tenantId: string, page = 1, pageSize = 20) {
  const offset = (page - 1) * pageSize
  const rows = await db.query.billingInvoices.findMany({
    where: eq(billingInvoices.tenant_id, tenantId),
    orderBy: [desc(billingInvoices.created_at)],
    limit: pageSize,
    offset,
  })
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(billingInvoices)
    .where(eq(billingInvoices.tenant_id, tenantId))
  return { invoices: rows, total, page, pageSize }
}

export async function getInvoice(tenantId: string, invoiceId: string) {
  const invoice = await db.query.billingInvoices.findFirst({
    where: and(eq(billingInvoices.id, invoiceId), eq(billingInvoices.tenant_id, tenantId)),
  })
  if (!invoice) throw new AppError(404, 'NOT_FOUND', 'Invoice not found')
  return invoice
}

// ─── Admin invoice functions ──────────────────────────────────────────────────

export async function adminListInvoices(query: {
  page?: number
  pageSize?: number
  status?: string
  tenantId?: string
  q?: string
}) {
  const { page = 1, pageSize = 30, status, tenantId: filterTenantId, q } = query
  const offset = (page - 1) * pageSize

  const rows = await db
    .select({
      invoice: billingInvoices,
      tenant_name: tenants.name,
      tenant_slug: tenants.slug,
    })
    .from(billingInvoices)
    .innerJoin(tenants, eq(billingInvoices.tenant_id, tenants.id))
    .where(
      and(
        filterTenantId ? eq(billingInvoices.tenant_id, filterTenantId) : undefined,
        status ? eq(billingInvoices.status, status as 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded') : undefined,
        q ? or(
          ilike(billingInvoices.invoice_number, `%${q}%`),
          ilike(tenants.name, `%${q}%`),
          ilike(tenants.slug, `%${q}%`),
        ) : undefined,
      ),
    )
    .orderBy(desc(billingInvoices.created_at))
    .limit(pageSize)
    .offset(offset)

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(billingInvoices)
    .innerJoin(tenants, eq(billingInvoices.tenant_id, tenants.id))
    .where(
      and(
        filterTenantId ? eq(billingInvoices.tenant_id, filterTenantId) : undefined,
        status ? eq(billingInvoices.status, status as 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded') : undefined,
        q ? or(
          ilike(billingInvoices.invoice_number, `%${q}%`),
          ilike(tenants.name, `%${q}%`),
        ) : undefined,
      ),
    )

  return {
    invoices: rows.map(r => ({ ...r.invoice, tenant_name: r.tenant_name, tenant_slug: r.tenant_slug })),
    total,
    page,
    pageSize,
  }
}

export async function adminMarkInvoicePaid(
  invoiceId: string,
  adminId: string,
  notes?: string,
): Promise<void> {
  const invoice = await db.query.billingInvoices.findFirst({
    where: eq(billingInvoices.id, invoiceId),
    columns: { id: true, status: true, tenant_id: true, plan_type: true, period_end: true },
  })
  if (!invoice) throw new AppError(404, 'NOT_FOUND', 'Invoice not found')
  if (invoice.status === 'paid') throw new AppError(409, 'ALREADY_PAID', 'Invoice is already paid')
  if (invoice.status === 'cancelled') throw new AppError(409, 'INVOICE_CANCELLED', 'Cannot pay a cancelled invoice')

  const now = new Date()
  await db.update(billingInvoices)
    .set({
      status: 'paid',
      paid_at: now,
      provider: 'manual',
      notes: notes ?? null,
      updated_at: now,
    })
    .where(eq(billingInvoices.id, invoiceId))

  const periodEnd = invoice.period_end ?? addMonths(now, 1)
  await db.update(tenants)
    .set({
      plan_type: invoice.plan_type as 'doctor_individual' | 'clinic_complete' | 'free' | 'pro' | 'enterprise',
      stripe_subscription_id: `manual:${invoiceId}`,
      subscription_current_period_end: periodEnd,
      updated_at: now,
    })
    .where(eq(tenants.id, invoice.tenant_id))

  await db.update(tenantAccessGrants)
    .set({ status: 'converted', updated_at: now })
    .where(and(
      eq(tenantAccessGrants.tenant_id, invoice.tenant_id),
      eq(tenantAccessGrants.status, 'active'),
    ))

  await createAuditLog({
    tenant_id: invoice.tenant_id,
    actor_id: adminId,
    actor_type: 'USER',
    action: 'BILLING_INVOICE_PAID_MANUAL',
    resource_type: 'TENANT',
    resource_id: invoice.tenant_id,
    context: { invoice_id: invoiceId, notes },
  })
}

export async function adminCancelInvoice(
  invoiceId: string,
  adminId: string,
  notes?: string,
): Promise<void> {
  const invoice = await db.query.billingInvoices.findFirst({
    where: eq(billingInvoices.id, invoiceId),
    columns: { id: true, status: true, tenant_id: true },
  })
  if (!invoice) throw new AppError(404, 'NOT_FOUND', 'Invoice not found')
  if (invoice.status === 'cancelled') throw new AppError(409, 'ALREADY_CANCELLED', 'Invoice is already cancelled')
  if (invoice.status === 'paid') throw new AppError(409, 'ALREADY_PAID', 'Cannot cancel a paid invoice')

  await db.update(billingInvoices)
    .set({ status: 'cancelled', notes: notes ?? null, updated_at: new Date() })
    .where(eq(billingInvoices.id, invoiceId))

  await createAuditLog({
    tenant_id: invoice.tenant_id,
    actor_id: adminId,
    actor_type: 'USER',
    action: 'BILLING_INVOICE_CANCELLED',
    resource_type: 'TENANT',
    resource_id: invoice.tenant_id,
    context: { invoice_id: invoiceId, notes },
  })
}

// ─── Create checkout session ─────────────────────────────────────────────────

export async function createCheckoutSession(
  tenantId: string,
  actorId: string,
  actorEmail: string,
  plan: CommercialPlan = 'doctor_individual',
  provider: PaymentProvider = getDefaultPaymentProvider(),
): Promise<{ url: string }> {
  if (!isCommercialPlan(plan)) throw new AppError(400, 'INVALID_PLAN', 'Plan inválido')
  if (!isPaymentProvider(provider)) throw new AppError(400, 'INVALID_PAYMENT_PROVIDER', 'Proveedor de pago inválido')

  const activeGrant = await findActiveAccessGrant(tenantId)
  const conversionMetadata: Record<string, string> = activeGrant
    ? {
        conversion_source: 'trial',
        access_grant_id: activeGrant.id,
        access_grant_type: activeGrant.grant_type,
        access_grant_ends_at: activeGrant.ends_at.toISOString(),
      }
    : { conversion_source: 'direct' }

  if (provider === 'recurrente') {
    const result = await createRecurrenteCheckout(tenantId, plan, conversionMetadata)

    const invoiceNumber = await generateInvoiceNumber()
    const now = new Date()
    await db.insert(billingInvoices).values({
      tenant_id: tenantId,
      invoice_number: invoiceNumber,
      status: 'pending',
      plan_type: plan,
      amount_gtq: String(PLAN_PRICES_GTQ[plan]),
      currency: 'GTQ',
      provider: 'recurrente',
      provider_checkout_id: result.providerSessionId,
      period_start: now,
      period_end: addMonths(now, 1),
      created_by: actorId,
      metadata: { checkout_url: result.url, ...conversionMetadata },
    })

    await createAuditLog({
      tenant_id: tenantId,
      actor_id: actorId,
      actor_type: 'USER',
      actor_email: actorEmail,
      action: 'BILLING_CHECKOUT_STARTED',
      resource_type: 'TENANT',
      resource_id: tenantId,
      context: {
        provider,
        plan,
        provider_session_id: result.providerSessionId,
        invoice_number: invoiceNumber,
        ...conversionMetadata,
      },
    })

    return { url: result.url }
  }

  if (!config.stripe.secretKey) throw new AppError(503, 'BILLING_UNAVAILABLE', 'Stripe billing not configured')

  const customerId = await ensureStripeCustomer(tenantId)
  const priceId = priceIdForPlan(plan)

  const session = await stripePost<{ id: string, url: string }>('/checkout/sessions', {
    'customer': customerId,
    'mode': 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'success_url': `${config.frontendUrl}/settings/billing?upgraded=true`,
    'cancel_url': `${config.frontendUrl}/settings/billing?cancelled=true`,
    'metadata[tenant_id]': tenantId,
    'metadata[plan]': plan,
    'metadata[conversion_source]': conversionMetadata.conversion_source,
    ...(activeGrant ? {
      'metadata[access_grant_id]': activeGrant.id,
      'metadata[access_grant_type]': activeGrant.grant_type,
    } : {}),
    'subscription_data[metadata][tenant_id]': tenantId,
    'subscription_data[metadata][plan]': plan,
    'subscription_data[metadata][conversion_source]': conversionMetadata.conversion_source,
    ...(activeGrant ? {
      'subscription_data[metadata][access_grant_id]': activeGrant.id,
      'subscription_data[metadata][access_grant_type]': activeGrant.grant_type,
    } : {}),
  })

  const invoiceNumber = await generateInvoiceNumber()
  const now = new Date()
  await db.insert(billingInvoices).values({
    tenant_id: tenantId,
    invoice_number: invoiceNumber,
    status: 'pending',
    plan_type: plan,
    amount_gtq: String(PLAN_PRICES_GTQ[plan]),
    currency: 'GTQ',
    provider: 'stripe',
    provider_checkout_id: session.id,
    period_start: now,
    period_end: addMonths(now, 1),
    created_by: actorId,
    metadata: { price_id: priceId, ...conversionMetadata },
  })

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'BILLING_CHECKOUT_STARTED',
    resource_type: 'TENANT',
    resource_id: tenantId,
    context: { provider, plan, price_id: priceId, invoice_number: invoiceNumber, ...conversionMetadata },
  })

  return { url: session.url }
}

async function createRecurrenteCheckout(
  tenantId: string,
  plan: CommercialPlan,
  conversionMetadata: Record<string, string>,
): Promise<{ url: string, providerSessionId: string }> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { id: true, name: true, slug: true },
  })
  if (!tenant) throw new AppError(404, 'NOT_FOUND', 'Tenant not found')

  const amountInCents = PLAN_PRICES_GTQ[plan] * 100
  const referenceId = `meditrack-${tenantId}-${plan}-${Date.now()}`
  const data = await recurrentePost<Record<string, unknown>>('/checkouts', {
    items: [
      {
        name: plan === 'doctor_individual' ? 'Meditrack Doctor Individual' : 'Meditrack Clínica Completa',
        amount_in_cents: amountInCents,
        currency: 'GTQ',
        quantity: 1,
      },
    ],
    success_url: `${config.frontendUrl}/settings/billing?upgraded=true`,
    cancel_url: `${config.frontendUrl}/settings/billing?cancelled=true`,
    metadata: {
      provider: 'recurrente',
      product: 'meditrack_subscription',
      purpose: 'subscription',
      tenant_id: tenantId,
      tenant_slug: tenant.slug,
      plan,
      reference_id: referenceId,
      ...conversionMetadata,
    },
  })

  const checkout = data.checkout as Record<string, unknown> | undefined
  const url = data.checkout_url ?? data.url ?? checkout?.checkout_url
  const providerSessionId = data.id ?? checkout?.id ?? data.checkout_id ?? checkout?.checkout_id ?? referenceId

  if (typeof url !== 'string' || !url) {
    throw new AppError(502, 'RECURRENTE_ERROR', 'Recurrente did not return a checkout URL')
  }

  return {
    url,
    providerSessionId: String(providerSessionId),
  }
}

// ─── Create billing portal session (manage subscription) ─────────────────────

export async function createPortalSession(tenantId: string): Promise<{ url: string }> {
  if (getDefaultPaymentProvider() === 'recurrente') {
    throw new AppError(
      501,
      'BILLING_PORTAL_UNAVAILABLE',
      'La gestión automática de suscripción aún no está disponible para Recurrente',
    )
  }
  if (!config.stripe.secretKey) throw new AppError(503, 'BILLING_UNAVAILABLE', 'Stripe billing not configured')

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
  items: { data: Array<{ price: { id: string, product: string } }> }
}

interface StripeCheckoutSession {
  id: string
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
    await applySubscriptionUpdate(tenantId, sub, false, session.id)
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as StripeSubscription
    const tenantId = sub.metadata?.tenant_id
    if (!tenantId) return
    await applySubscriptionUpdate(tenantId, sub, event.type === 'customer.subscription.deleted')
  }
}

export function verifyRecurrenteSignature(
  rawBody: string,
  headers: Record<string, string | undefined>,
  secret: string,
): void {
  const svixId = headers['svix-id']
  const svixTimestamp = headers['svix-timestamp']
  const svixSignature = headers['svix-signature']
  if (!svixId || !svixTimestamp || !svixSignature) {
    throw new AppError(400, 'INVALID_SIGNATURE', 'Missing Recurrente signature headers')
  }

  const timestamp = Number(svixTimestamp)
  if (!Number.isFinite(timestamp)) {
    throw new AppError(400, 'INVALID_SIGNATURE', 'Invalid Recurrente timestamp')
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp)
  if (ageSeconds > config.payments.recurrente.webhookMaxSkewSeconds) {
    throw new AppError(400, 'STALE_EVENT', 'Recurrente webhook event is too old')
  }

  const secretPart = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const expected = createHmac('sha256', Buffer.from(secretPart, 'base64'))
    .update(signedContent)
    .digest('base64')
  const expectedBuffer = Buffer.from(expected)
  const signatures = svixSignature
    .split(' ')
    .flatMap((part) => part.split(','))
    .filter((part) => part && part !== 'v1')

  const valid = signatures.some((signature) => {
    const signatureBuffer = Buffer.from(signature)
    return signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer)
  })

  if (!valid) throw new AppError(400, 'INVALID_SIGNATURE', 'Recurrente webhook signature verification failed')
}

export async function handleRecurrenteWebhook(
  rawBody: string,
  headers: Record<string, string | undefined>,
): Promise<void> {
  if (config.payments.recurrente.webhookSecret) {
    verifyRecurrenteSignature(rawBody, headers, config.payments.recurrente.webhookSecret)
  } else if (config.env === 'production') {
    throw new AppError(503, 'BILLING_WEBHOOK_UNAVAILABLE', 'Recurrente webhook secret not configured')
  }

  const payload = JSON.parse(rawBody) as Record<string, unknown>
  const eventType = payload.event_type ?? payload.type ?? payload.event
  const data = payload.data as Record<string, unknown> | undefined
  const checkout = (payload.checkout ?? data?.checkout ?? {}) as Record<string, unknown>
  const metadata = (checkout.metadata ?? payload.metadata ?? data?.metadata ?? {}) as Record<string, string | undefined>

  if (metadata.product && metadata.product !== 'meditrack_subscription') return
  if (eventType !== 'payment_intent.succeeded') return

  const tenantId = metadata.tenant_id
  const plan = metadata.plan
  if (!tenantId || !isCommercialPlan(plan)) return

  const checkoutId = checkout.id ?? payload.checkout_id ?? data?.checkout_id ?? metadata.reference_id
  const payment = payload.payment as Record<string, unknown> | undefined
  const paymentId = payload.id ?? payment?.id ?? data?.id ?? checkoutId

  await applyProviderPaymentUpdate({
    tenantId,
    plan,
    provider: 'recurrente',
    providerReference: paymentId ? String(paymentId) : checkoutId ? String(checkoutId) : null,
    checkoutId: checkoutId ? String(checkoutId) : null,
  })
}

async function applyProviderPaymentUpdate(input: {
  tenantId: string
  plan: CommercialPlan
  provider: PaymentProvider
  providerReference: string | null
  checkoutId?: string | null
}): Promise<void> {
  const now = new Date()

  await db.update(tenants)
    .set({
      plan_type: input.plan,
      stripe_subscription_id: input.providerReference ? `${input.provider}:${input.providerReference}` : input.provider,
      subscription_current_period_end: addMonths(now, 1),
      updated_at: now,
    })
    .where(eq(tenants.id, input.tenantId))

  await db.update(tenantAccessGrants)
    .set({ status: 'converted', updated_at: now })
    .where(and(
      eq(tenantAccessGrants.tenant_id, input.tenantId),
      eq(tenantAccessGrants.status, 'active'),
    ))

  // Mark matching pending invoice as paid
  if (input.checkoutId) {
    await db.update(billingInvoices)
      .set({
        status: 'paid',
        paid_at: now,
        provider_payment_id: input.providerReference ?? undefined,
        updated_at: now,
      })
      .where(and(
        eq(billingInvoices.tenant_id, input.tenantId),
        eq(billingInvoices.provider_checkout_id, input.checkoutId),
        eq(billingInvoices.status, 'pending'),
      ))
  }
}

async function applySubscriptionUpdate(
  tenantId: string,
  sub: StripeSubscription,
  deleted = false,
  checkoutSessionId?: string,
): Promise<void> {
  const newPlan = resolvePlanFromSubscription(sub, deleted)
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null
  const now = new Date()

  await db.update(tenants)
    .set({
      plan_type: newPlan,
      stripe_subscription_id: deleted ? null : sub.id,
      subscription_current_period_end: periodEnd,
      updated_at: now,
    })
    .where(eq(tenants.id, tenantId))

  if (!deleted && isCommercialPlan(newPlan)) {
    await db.update(tenantAccessGrants)
      .set({ status: 'converted', updated_at: now })
      .where(and(
        eq(tenantAccessGrants.tenant_id, tenantId),
        eq(tenantAccessGrants.status, 'active'),
      ))
  }

  // Mark matching pending invoice as paid when checkout completes
  if (!deleted && checkoutSessionId && isCommercialPlan(newPlan)) {
    await db.update(billingInvoices)
      .set({
        status: 'paid',
        paid_at: now,
        provider_payment_id: sub.id,
        updated_at: now,
      })
      .where(and(
        eq(billingInvoices.tenant_id, tenantId),
        eq(billingInvoices.provider_checkout_id, checkoutSessionId),
        eq(billingInvoices.status, 'pending'),
      ))
  }
}
