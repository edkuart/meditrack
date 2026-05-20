import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { ForbiddenError } from '../../shared/errors.ts'
import { InviteStaffSchema, AcceptInviteSchema, PromoteStaffSchema } from './staff.schema.ts'
import * as staffService from './staff.service.ts'

const router = new Hono()

// Public router — must be registered in app.ts BEFORE the global auth middleware
const staffPublicRouter = new Hono()

// ── Staff list (any authenticated user) ──────────────────────────────────────
router.get('/staff', requireAuth, async (c) => {
  const auth = c.get('auth')
  const data = await staffService.listStaff(auth.tenant_id)
  return c.json({ success: true, data })
})

// ── Invite new staff member (admin only) ──────────────────────────────────────
router.post(
  '/staff/invite',
  requireAuth,
  zValidator('json', InviteStaffSchema),
  async (c) => {
    const auth = c.get('auth')
    if (auth.role !== 'ADMIN_CLINIC' && auth.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only clinic admins can invite staff')
    }
    const data = await staffService.inviteStaff(
      auth.tenant_id,
      auth.sub,
      auth.email,
      c.req.valid('json'),
    )
    return c.json({ success: true, data }, 201)
  },
)

// ── Promote / change role (admin only) ───────────────────────────────────────
router.patch(
  '/staff/:userId/role',
  requireAuth,
  zValidator('json', PromoteStaffSchema),
  async (c) => {
    const auth = c.get('auth')
    if (auth.role !== 'ADMIN_CLINIC' && auth.role !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only clinic admins can change roles')
    }
    const data = await staffService.promoteStaff(
      auth.tenant_id,
      auth.sub,
      c.req.param('userId')!,
      c.req.valid('json'),
    )
    return c.json({ success: true, data })
  },
)

// ── Deactivate staff member (admin only) ──────────────────────────────────────
router.delete('/staff/:userId', requireAuth, async (c) => {
  const auth = c.get('auth')
  if (auth.role !== 'ADMIN_CLINIC' && auth.role !== 'SUPER_ADMIN') {
    throw new ForbiddenError('Only clinic admins can remove staff')
  }
  await staffService.deactivateStaff(auth.tenant_id, auth.sub, c.req.param('userId')!)
  return c.json({ success: true, data: null })
})

// ── Cancel pending invitation (admin only) ────────────────────────────────────
router.delete('/staff/invitations/:id', requireAuth, async (c) => {
  const auth = c.get('auth')
  if (auth.role !== 'ADMIN_CLINIC' && auth.role !== 'SUPER_ADMIN') {
    throw new ForbiddenError('Only clinic admins can cancel invitations')
  }
  await staffService.cancelInvitation(auth.tenant_id, c.req.param('id')!)
  return c.json({ success: true, data: null })
})

// ── Resend pending invitation (admin only) ────────────────────────────────────
router.post('/staff/invitations/:id/resend', requireAuth, async (c) => {
  const auth = c.get('auth')
  if (auth.role !== 'ADMIN_CLINIC' && auth.role !== 'SUPER_ADMIN') {
    throw new ForbiddenError('Only clinic admins can resend invitations')
  }
  const data = await staffService.resendInvitation(
    auth.tenant_id, auth.sub, auth.email, c.req.param('id')!,
  )
  return c.json({ success: true, data })
})

staffPublicRouter.post(
  '/staff/accept-invite',
  zValidator('json', AcceptInviteSchema),
  async (c) => {
    const data = await staffService.acceptInvitation(c.req.valid('json'))
    return c.json({ success: true, data })
  },
)

export { router as staffRouter, staffPublicRouter }
