import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { PERMISSIONS, requirePermission } from '../../shared/permissions.ts'
import {
  InviteStaffSchema,
  AcceptInviteSchema,
  PromoteStaffSchema,
  CreateCustomRoleSchema,
  UpdateCustomRoleSchema,
} from './staff.schema.ts'
import * as staffService from './staff.service.ts'
import { setClinicalSessionCookies } from '../../shared/session-cookies.ts'

const router = new Hono()

// Public router — must be registered in app.ts BEFORE the global auth middleware
const staffPublicRouter = new Hono()

// ── Staff list (any authenticated user) ──────────────────────────────────────
router.get('/staff', requireAuth, requirePermission(PERMISSIONS.STAFF_MANAGE), async (c) => {
  const auth = c.get('auth')
  const data = await staffService.listStaff(auth.tenant_id)
  return c.json({ success: true, data })
})

router.get('/staff/roles', requireAuth, requirePermission(PERMISSIONS.STAFF_MANAGE), async (c) => {
  const auth = c.get('auth')
  const data = await staffService.listCustomRoles(auth.tenant_id)
  return c.json({ success: true, data })
})

router.post(
  '/staff/roles',
  requireAuth,
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  zValidator('json', CreateCustomRoleSchema),
  async (c) => {
    const auth = c.get('auth')
    const data = await staffService.createCustomRole(
      auth.tenant_id,
      auth.sub,
      auth.email,
      c.req.valid('json'),
    )
    return c.json({ success: true, data }, 201)
  },
)

router.patch(
  '/staff/roles/:roleId',
  requireAuth,
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  zValidator('json', UpdateCustomRoleSchema),
  async (c) => {
    const auth = c.get('auth')
    const data = await staffService.updateCustomRole(
      auth.tenant_id,
      auth.sub,
      auth.email,
      c.req.param('roleId')!,
      c.req.valid('json'),
    )
    return c.json({ success: true, data })
  },
)

router.delete('/staff/roles/:roleId', requireAuth, requirePermission(PERMISSIONS.STAFF_MANAGE), async (c) => {
  const auth = c.get('auth')
  await staffService.deactivateCustomRole(auth.tenant_id, auth.sub, auth.email, c.req.param('roleId')!)
  return c.json({ success: true, data: null })
})

// ── Invite new staff member (admin only) ──────────────────────────────────────
router.post(
  '/staff/invite',
  requireAuth,
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  zValidator('json', InviteStaffSchema),
  async (c) => {
    const auth = c.get('auth')
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
  requirePermission(PERMISSIONS.STAFF_MANAGE),
  zValidator('json', PromoteStaffSchema),
  async (c) => {
    const auth = c.get('auth')
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
router.delete('/staff/:userId', requireAuth, requirePermission(PERMISSIONS.STAFF_MANAGE), async (c) => {
  const auth = c.get('auth')
  await staffService.deactivateStaff(auth.tenant_id, auth.sub, c.req.param('userId')!)
  return c.json({ success: true, data: null })
})

// ── Cancel pending invitation (admin only) ────────────────────────────────────
router.delete('/staff/invitations/:id', requireAuth, requirePermission(PERMISSIONS.STAFF_MANAGE), async (c) => {
  const auth = c.get('auth')
  await staffService.cancelInvitation(auth.tenant_id, c.req.param('id')!)
  return c.json({ success: true, data: null })
})

// ── Resend pending invitation (admin only) ────────────────────────────────────
router.post('/staff/invitations/:id/resend', requireAuth, requirePermission(PERMISSIONS.STAFF_MANAGE), async (c) => {
  const auth = c.get('auth')
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
    setClinicalSessionCookies(c, data.access_token, data.refresh_token)
    return c.json({ success: true, data })
  },
)

export { router as staffRouter, staffPublicRouter }
