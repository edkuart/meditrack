import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { verifyPatientToken } from '../../shared/services/token.service.ts'
import { UnauthorizedError } from '../../shared/errors.ts'
import {
  GenerateAccessSchema, PatientCheckInSchema, ValidateMagicLinkSchema, ValidatePinSchema,
} from './portal.schema.ts'
import * as portalService from './portal.service.ts'
import { SubmitExternalLabSchema } from '../lab-external/lab-external.schema.ts'
import * as labExternalService from '../lab-external/lab-external.service.ts'
import { rateLimit } from '../../shared/middleware/rate-limit.middleware.ts'
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

const portalAuthRouter = new Hono()
const router = new Hono()
const portalAuthLimiter = rateLimit({ keyPrefix: 'portal-auth', windowMs: 15 * 60 * 1000, max: 20 })

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

portalAuthRouter.post(
  '/portal/auth/magic-link',
  portalAuthLimiter,
  zValidator('json', ValidateMagicLinkSchema),
  async (c) => {
    const { token } = c.req.valid('json')
    const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? undefined
    const result = await portalService.validateMagicLink(token, ip)
    return c.json({ success: true, data: result })
  },
)

// ── Patient auth: PIN ──────────────────────────────────────────────────────────

portalAuthRouter.post(
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

router.get('/portal/treatments', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getActiveTreatments(p.sub)
  return c.json({ success: true, data })
})

router.get('/portal/doses/today', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getTodayDosesForPortal(p.sub)
  return c.json({ success: true, data })
})

router.get('/portal/check-ins/today', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getTodayCheckInForPortal(p.sub)
  return c.json({ success: true, data })
})

router.post('/portal/check-ins', requirePatient, zValidator('json', PatientCheckInSchema), async (c) => {
  const p = c.get('patient')
  const data = await portalService.submitPatientCheckIn(p.sub, p.tenant_id, c.req.valid('json'))
  return c.json({ success: true, data }, 201)
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

router.get('/portal/encounters/:id', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getEncounterDetailForPortal(p.sub, c.req.param('id')!)
  return c.json({ success: true, data })
})

router.get('/portal/documents', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getPatientDocuments(p.sub)
  return c.json({ success: true, data })
})

router.get('/portal/lab/orders', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getLabOrdersForPortal(p.sub, p.tenant_id)
  return c.json({ success: true, data })
})

router.get('/portal/lab/orders/:id', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getLabOrderForPortal(p.sub, p.tenant_id, c.req.param('id')!)
  return c.json({ success: true, data })
})

// Patient submits external lab results (multipart: files + JSON metadata)
router.post('/portal/lab/submit-external', requirePatient, async (c) => {
  const p = c.get('patient')

  const formData = await c.req.formData()
  const files: File[] = []
  for (const [, value] of formData.entries()) {
    if (value instanceof File) files.push(value)
  }

  const metaRaw = formData.get('meta')
  const meta = SubmitExternalLabSchema.safeParse(
    metaRaw ? JSON.parse(String(metaRaw)) : {},
  )
  if (!meta.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: meta.error.message } }, 400)
  }

  const data = await labExternalService.submitExternalLab(p.tenant_id, p.sub, files, meta.data)
  return c.json({ success: true, data }, 201)
})

// Patient views their external submissions
router.get('/portal/lab/external-submissions', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await labExternalService.getPatientSubmissions(p.sub, p.tenant_id)
  return c.json({ success: true, data })
})

router.get('/portal/adherence', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getAdherenceForPortal(p.sub)
  return c.json({ success: true, data })
})

router.get('/portal/engagement', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getEngagementForPortal(p.sub)
  return c.json({ success: true, data })
})

router.get('/portal/documents/:id/url', requirePatient, async (c) => {
  const p = c.get('patient')
  const data = await portalService.getDocumentUrlForPatient(p.sub, c.req.param('id') as string)
  return c.json({ success: true, data })
})

export { portalAuthRouter, router as portalRouter }
