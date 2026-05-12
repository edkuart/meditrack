import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { prettyJSON } from 'hono/pretty-json'
import { sql } from 'drizzle-orm'
import { config } from './shared/config.ts'
import { db } from './shared/db/index.ts'
import { errorHandler } from './shared/middleware/error.middleware.ts'
import { authRouter } from './modules/auth/auth.router.ts'
import { patientsRouter } from './modules/patients/patients.router.ts'
import { encountersRouter } from './modules/encounters/encounters.router.ts'
import { treatmentsRouter } from './modules/treatments/treatments.router.ts'
import { portalRouter } from './modules/portal/portal.router.ts'
import { documentsRouter } from './modules/documents/documents.router.ts'
import { notificationsRouter } from './modules/notifications/notifications.router.ts'
import { analyticsRouter } from './modules/analytics/analytics.router.ts'
import { staffRouter } from './modules/staff/staff.router.ts'
import { fhirRouter } from './modules/fhir/fhir.router.ts'
import { clinicalProtocolsRouter } from './modules/clinical-protocols/clinical-protocols.router.ts'
import { aiAssistRouter } from './modules/ai-assist/ai-assist.router.ts'
import { billingRouter, stripeWebhookRouter } from './modules/billing/billing.router.ts'
import { onboardingRouter } from './modules/onboarding/onboarding.router.ts'
import { settingsRouter } from './modules/settings/settings.router.ts'
import { complianceRouter } from './modules/compliance/compliance.router.ts'
import { rateLimit } from './shared/middleware/rate-limit.middleware.ts'
import { securityHeaders } from './shared/middleware/security.middleware.ts'
import { requestContext, structuredRequestLogger } from './shared/middleware/observability.middleware.ts'
import { getJobHealth } from './shared/observability/job-health.ts'

export function createApp() {
  const app = new Hono()
  const allowedOrigins = new Set(config.frontendOrigins)

  app.use('*', requestContext)
  app.use('*', structuredRequestLogger)
  app.use('*', securityHeaders)
  app.use('*', cors({
    origin: (origin) => allowedOrigins.has(origin) ? origin : undefined,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }))

  if (config.env === 'development') {
    app.use('*', prettyJSON())
  }

  app.get('/health', (c) => c.json({
    status: 'ok',
    service: 'meditrack-api',
    env: config.env,
    uptime_seconds: Math.round(process.uptime()),
    request_id: c.get('requestId'),
    timestamp: new Date().toISOString(),
  }))

  app.get('/ready', async (c) => {
    const checks = {
      database: 'ok' as 'ok' | 'error',
    }

    try {
      await db.execute(sql`select 1`)
    } catch {
      checks.database = 'error'
    }

    const ready = Object.values(checks).every((status) => status === 'ok')

    return c.json({
      status: ready ? 'ok' : 'degraded',
      checks,
      jobs: getJobHealth(),
      request_id: c.get('requestId'),
      timestamp: new Date().toISOString(),
    }, ready ? 200 : 503)
  })

  app.use('/api/v1/portal/auth/pin', rateLimit({
    keyPrefix: 'portal-pin',
    windowMs: 15 * 60 * 1000,
    max: 6,
  }))

  // Public routes (no auth middleware) — must come before any router that uses router.use('*', requireAuth)
  app.route('/api/v1/auth', authRouter)
  app.route('/api/v1', stripeWebhookRouter)

  // Protected routes
  app.route('/api/v1/patients', patientsRouter)
  app.route('/api/v1', encountersRouter)
  app.route('/api/v1', treatmentsRouter)
  app.route('/api/v1', portalRouter)
  app.route('/api/v1', documentsRouter)
  app.route('/api/v1', notificationsRouter)
  app.route('/api/v1', analyticsRouter)
  app.route('/api/v1', staffRouter)
  app.route('/api/v1', fhirRouter)
  app.route('/api/v1', clinicalProtocolsRouter)
  app.route('/api/v1', aiAssistRouter)
  app.route('/api/v1', billingRouter)
  app.route('/api/v1', onboardingRouter)
  app.route('/api/v1', settingsRouter)
  app.route('/api/v1', complianceRouter)

  app.onError(errorHandler)

  app.notFound((c) => c.json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  }, 404))

  return app
}

const app = createApp()

export default app
