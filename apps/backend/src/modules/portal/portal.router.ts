import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { verifyPatientToken } from '../../shared/services/token.service.ts'
import { UnauthorizedError } from '../../shared/errors.ts'
import {
  GenerateAccessSchema, ValidateMagicLinkSchema, ValidatePinSchema,
} from './portal.schema.ts'
import * as portalService from './portal.service.ts'
import type { PatientTokenPayload } from '../../shared/services/token.service.ts'
import type { Context, Next } from 'hono'

// ─── Patient auth middleware ───────────────────────────────────────────────────

declare module 'hono' {
  interface ContextVariableMap {
    patient: PatientTokenPayload
  }
}

async function requirePatient(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedError()
  try {
    const payload = await verifyPatientToken(authHeader.slice(7))
    c.set('patient', payload)
    await next()
  } catch {
    throw new UnauthorizedError('Invalid or expired patient session')
  }
}

const router = new Hono()

// ── Doctor-facing: generate / revoke access ───────────────────────────────────

router.post(
  '/patients/:patientId/access',
  requireAuth,
  zValidator('json', GenerateAccessSchema),
  async (c) => {
    const auth = c.get('auth')
    const result = await portalService.generatePatientAccess(
      auth.tenant_id, auth.sub, auth.email,
      c.req.param('patientId')!,
      c.req.valid('json'),
    )
    return c.json({ success: true, data: result }, 201)
  },
)

router.delete('/patients/:patientId/access', requireAuth, async (c) => {
  const auth = c.get('auth')
  await portalService.revokePatientAccess(
    auth.tenant_id, auth.sub, auth.email, c.req.param('patientId')!,
  )
  return c.json({ success: true, data: null })
})

// ── Patient auth: validate magic link / QR ─────────────────────────────────────

router.post(
  '/portal/auth/magic-link',
  zValidator('json', ValidateMagicLinkSchema),
  async (c) => {
    const { token } = c.req.valid('json')
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? undefined
    const result = await portalService.validateMagicLink(token, ip)
    return c.json({ success: true, data: result })
  },
)

// ── Patient auth: PIN ──────────────────────────────────────────────────────────

router.post(
  '/portal/auth/pin',
  zValidator('json', ValidatePinSchema),
  async (c) => {
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? undefined
    const result = await portalService.validatePin(c.req.valid('json'), ip)
    return c.json({ success: true, data: result })
  },
)

// ── Patient portal data ────────────────────────────────────────────────────────

router.get('/portal/me', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getPortalMe(p.sub)
  return c.json({ success: true, data })
})

router.get('/portal/treatment', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getActiveTreatment(p.sub)
  return c.json({ success: true, data })
})

router.get('/portal/doses/today', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getTodayDosesForPortal(p.sub)
  return c.json({ success: true, data })
})

router.post('/portal/doses/:id/confirm', requirePatient, async (c) => {
  const p = c.get('patient')
  const body = await c.req.json().catch(() => ({}))
  const data = await portalService.confirmDoseAsPatient(
    p.sub, p.tenant_id, c.req.param('id')!, body.notes,
  )
  return c.json({ success: true, data })
})

router.get('/portal/history', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getPatientHistory(p.sub)
  return c.json({ success: true, data })
})

router.get('/portal/documents', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getPatientDocuments(p.sub)
  return c.json({ success: true, data })
})

router.get('/portal/adherence', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getAdherenceForPortal(p.sub)
  return c.json({ success: true, data })
})

export { router as portalRouter }
