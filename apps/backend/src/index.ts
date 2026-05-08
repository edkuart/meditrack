import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { prettyJSON } from 'hono/pretty-json'
import { config } from './shared/config.ts'
import { errorHandler } from './shared/middleware/error.middleware.ts'
import { authRouter } from './modules/auth/auth.router.ts'
import { patientsRouter } from './modules/patients/patients.router.ts'
import { encountersRouter } from './modules/encounters/encounters.router.ts'
import { treatmentsRouter } from './modules/treatments/treatments.router.ts'
import { portalRouter } from './modules/portal/portal.router.ts'
import { documentsRouter } from './modules/documents/documents.router.ts'

const app = new Hono()

// ─── Global middleware ─────────────────────────────────────────────────────────

app.use('*', logger())
app.use('*', cors({
  origin: config.frontendUrl,
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}))

if (config.env === 'development') {
  app.use('*', prettyJSON())
}

// ─── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.route('/api/v1/auth', authRouter)
app.route('/api/v1/patients', patientsRouter)
app.route('/api/v1', encountersRouter)
app.route('/api/v1', treatmentsRouter)
app.route('/api/v1', portalRouter)
app.route('/api/v1', documentsRouter)

// ─── Error handler ─────────────────────────────────────────────────────────────

app.onError(errorHandler)

app.notFound((c) => c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404))

// ─── Start ─────────────────────────────────────────────────────────────────────

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`meditrack api running on http://localhost:${config.port}`)
})

export default app
