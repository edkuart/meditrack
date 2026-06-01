import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { prettyJSON } from 'hono/pretty-json'
import { sql } from 'drizzle-orm'
import { config } from './shared/config.ts'
import { db } from './shared/db/index.ts'
import { errorHandler } from './shared/middleware/error.middleware.ts'
import { requireAuth, requireVerified } from './shared/middleware/auth.middleware.ts'
import { authRouter } from './modules/auth/auth.router.ts'
import { patientsRouter } from './modules/patients/patients.router.ts'
import { encountersRouter } from './modules/encounters/encounters.router.ts'
import { treatmentsRouter } from './modules/treatments/treatments.router.ts'
import { portalAuthRouter, portalRouter } from './modules/portal/portal.router.ts'
import { documentsRouter } from './modules/documents/documents.router.ts'
import { notificationsRouter } from './modules/notifications/notifications.router.ts'
import { analyticsRouter } from './modules/analytics/analytics.router.ts'
import { staffRouter, staffPublicRouter } from './modules/staff/staff.router.ts'
import { fhirRouter } from './modules/fhir/fhir.router.ts'
import { clinicalProtocolsRouter } from './modules/clinical-protocols/clinical-protocols.router.ts'
import { aiAssistRouter } from './modules/ai-assist/ai-assist.router.ts'
import { billingRouter, stripeWebhookRouter } from './modules/billing/billing.router.ts'
import { onboardingRouter } from './modules/onboarding/onboarding.router.ts'
import { settingsRouter } from './modules/settings/settings.router.ts'
import { complianceRouter } from './modules/compliance/compliance.router.ts'
import { labRouter } from './modules/lab/lab.router.ts'
import { labExternalRouter } from './modules/lab-external/lab-external.router.ts'
import { vitalSignsRouter } from './modules/vital-signs/vital-signs.router.ts'
import { patientProblemsRouter } from './modules/patient-problems/patient-problems.router.ts'
import { patientBackgroundRouter } from './modules/patient-background/patient-background.router.ts'
import { clinicalIntelligenceRouter } from './modules/clinical-intelligence/clinical-intelligence.router.ts'
import { aiUsageRouter } from './modules/ai-usage/ai-usage.router.ts'
import { adminRouter } from './modules/admin/admin.router.ts'
import { departmentsRouter } from './modules/departments/departments.router.ts'
import { accessRouter } from './modules/patient-access/access.router.ts'
import { referralsRouter } from './modules/referrals/referrals.router.ts'
import { admissionsRouter } from './modules/admissions/admissions.router.ts'
import { doctorNotificationsRouter } from './modules/doctor-notifications/doctor-notifications.router.ts'
import { locationsRouter } from './modules/locations/locations.router.ts'
import { appointmentsRouter } from './modules/appointments/appointments.router.ts'
import { icd10Router } from './modules/icd10/icd10.router.ts'
import { pushRouter } from './modules/push/push.router.ts'
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
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
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

  // Public routes that must be registered BEFORE the auth middleware so they
  // are not blocked by the global requireAuth or by sub-router use('*', requireAuth).
  app.route('/api/v1', staffPublicRouter)

  // Clinical routes require authentication + verification.
  // requireAuth runs first (sets auth context), then requireVerified reads it.
  // Public and admin routes are exempt from both checks.
  app.use('/api/v1/*', async (c, next) => {
    const path = c.req.path
    const exempt = ['/api/v1/auth', '/api/v1/portal', '/api/v1/stripe', '/api/v1/admin', '/api/v1/billing/webhook']
    if (exempt.some(p => path.startsWith(p))) return next()
    return requireAuth(c, () => requireVerified(c, next))
  })

  // Public routes (no auth middleware) — must come before any router that uses router.use('*', requireAuth)
  app.route('/api/v1', adminRouter)
  app.route('/api/v1/auth', authRouter)
  app.route('/api/v1', stripeWebhookRouter)
  app.route('/api/v1', portalAuthRouter)
  app.route('/api/v1', portalRouter)

  // Protected routes
  app.route('/api/v1/patients', patientsRouter)
  app.route('/api/v1', encountersRouter)
  app.route('/api/v1', treatmentsRouter)
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
  app.route('/api/v1', labRouter)
  app.route('/api/v1', labExternalRouter)
  app.route('/api/v1', vitalSignsRouter)
  app.route('/api/v1', patientProblemsRouter)
  app.route('/api/v1', patientBackgroundRouter)
  app.route('/api/v1', clinicalIntelligenceRouter)
  app.route('/api/v1', aiUsageRouter)
  app.route('/api/v1', departmentsRouter)
  app.route('/api/v1', accessRouter)
  app.route('/api/v1', referralsRouter)
  app.route('/api/v1', admissionsRouter)
  app.route('/api/v1', appointmentsRouter)
  app.route('/api/v1', locationsRouter)
  app.route('/api/v1', doctorNotificationsRouter)
  app.route('/api/v1', icd10Router)
  app.route('/api/v1', pushRouter)

  app.onError(errorHandler)

  app.notFound((c) => c.json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  }, 404))

  return app
}

const app = createApp()

export default app
