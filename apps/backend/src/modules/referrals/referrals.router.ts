import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware.ts'
import {
  CreateReferralSchema,
  RespondReferralSchema,
  ListReferralsSchema,
} from './referrals.schema.ts'
import * as svc from './referrals.service.ts'

const router = new Hono()

router.use('*', requireAuth)

// ─── Doctor inbox ─────────────────────────────────────────────────────────────

router.get('/referrals', zValidator('query', ListReferralsSchema), async (c) => {
  const { tenant_id, sub } = c.get('auth')
  const { direction } = c.req.valid('query')
  const data = await svc.listDoctorReferrals(tenant_id, sub, direction)
  return c.json({ success: true, data })
})

// ─── Per-patient referrals ────────────────────────────────────────────────────

router.get('/patients/:patientId/referrals', async (c) => {
  const { tenant_id } = c.get('auth')
  const data = await svc.listPatientReferrals(tenant_id, c.req.param('patientId')!)
  return c.json({ success: true, data })
})

router.post(
  '/patients/:patientId/referrals',
  requireRole('ADMIN_CLINIC', 'DOCTOR'),
  zValidator('json', CreateReferralSchema),
  async (c) => {
    const { tenant_id, sub, email } = c.get('auth')
    const body = c.req.valid('json')
    const referral = await svc.createReferral(tenant_id, sub, email, c.req.param('patientId')!, body)
    return c.json({ success: true, data: referral }, 201)
  },
)

// ─── Single referral ──────────────────────────────────────────────────────────

router.get('/referrals/:id', async (c) => {
  const { tenant_id, sub } = c.get('auth')
  const data = await svc.getReferral(tenant_id, c.req.param('id')!, sub)
  return c.json({ success: true, data })
})

// ─── State transitions ────────────────────────────────────────────────────────

router.post('/referrals/:id/accept', zValidator('json', RespondReferralSchema), async (c) => {
  const { tenant_id, sub, email } = c.get('auth')
  const data = await svc.acceptReferral(tenant_id, c.req.param('id')!, sub, email, c.req.valid('json'))
  return c.json({ success: true, data })
})

router.post('/referrals/:id/reject', zValidator('json', RespondReferralSchema), async (c) => {
  const { tenant_id, sub, email } = c.get('auth')
  const data = await svc.rejectReferral(tenant_id, c.req.param('id')!, sub, email, c.req.valid('json'))
  return c.json({ success: true, data })
})

router.post('/referrals/:id/complete', zValidator('json', RespondReferralSchema), async (c) => {
  const { tenant_id, sub, email } = c.get('auth')
  const data = await svc.completeReferral(tenant_id, c.req.param('id')!, sub, email, c.req.valid('json'))
  return c.json({ success: true, data })
})

router.post('/referrals/:id/cancel', async (c) => {
  const { tenant_id, sub, email } = c.get('auth')
  const data = await svc.cancelReferral(tenant_id, c.req.param('id')!, sub, email)
  return c.json({ success: true, data })
})

export { router as referralsRouter }
