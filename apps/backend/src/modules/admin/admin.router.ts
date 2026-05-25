import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { zValidator } from '@hono/zod-validator'
import {
  AdminLoginSchema,
  AdminMfaVerifySchema,
  ListAdminAuditLogsQuerySchema,
  RejectDoctorSchema,
  ListUsersQuerySchema,
  ListTenantsQuerySchema,
  ListPasswordTicketsQuerySchema,
  UpdateTenantSchema,
  UpdatePasswordTicketSchema,
} from './admin.schema.ts'
import * as adminService from './admin.service.ts'
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware.ts'
import { rateLimit } from '../../shared/middleware/rate-limit.middleware.ts'
import { UnauthorizedError } from '../../shared/errors.ts'
import { config } from '../../shared/config.ts'
import { signAdminCsrfToken, verifyAdminCsrfToken } from '../../shared/services/admin-csrf.service.ts'

const router = new Hono()

const loginLimiter = rateLimit({ keyPrefix: 'admin-login', windowMs: 15 * 60 * 1000, max: 5 })
const ADMIN_ACCESS_COOKIE = 'meditrack_admin_access'
const ADMIN_REFRESH_COOKIE = 'meditrack_admin_refresh'
const ADMIN_COOKIE_PATH = '/api/v1/admin'
const ACCESS_COOKIE_MAX_AGE_SECONDS = 15 * 60
const REFRESH_COOKIE_MAX_AGE_SECONDS = config.jwt.refreshExpiresInDays * 24 * 60 * 60

// ─── Public: admin login (SUPER_ADMIN only) ────────────────────────────────────

router.post('/admin/auth/login', loginLimiter, zValidator('json', AdminLoginSchema), async (c) => {
  const body = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip')
  const ua = c.req.header('user-agent')
  const result = await adminService.adminLogin(body, ip, ua)
  return c.json({ success: true, data: result })
})

router.post('/admin/auth/mfa/verify', loginLimiter, zValidator('json', AdminMfaVerifySchema), async (c) => {
  const ua = c.req.header('user-agent')
  const result = await adminService.verifyAdminMfa(c.req.valid('json'), ua)
  setAdminSessionCookies(c, result.access_token, result.refresh_token)
  return c.json({ success: true, data: { user: result.user, session: 'cookie' } })
})

router.post('/admin/auth/refresh', async (c) => {
  const refreshToken = getCookie(c, ADMIN_REFRESH_COOKIE)
  if (!refreshToken) throw new UnauthorizedError('Missing refresh token', 'INVALID_REFRESH_TOKEN')

  const ua = c.req.header('user-agent')
  const result = await adminService.refreshAdminSession(refreshToken, ua)
  setAdminSessionCookies(c, result.access_token, result.refresh_token)
  return c.json({ success: true, data: { user: result.user, session: 'cookie' } })
})

router.post('/admin/auth/logout', async (c) => {
  const refreshToken = getCookie(c, ADMIN_REFRESH_COOKIE)
  const ua = c.req.header('user-agent')
  await adminService.logoutAdmin(refreshToken, ua)
  clearAdminSessionCookies(c)
  return c.json({ success: true, data: { message: 'Logged out' } })
})

router.get('/admin/auth/csrf', async (c) => {
  const refreshToken = getCookie(c, ADMIN_REFRESH_COOKIE)
  if (!refreshToken) throw new UnauthorizedError('Missing refresh token', 'INVALID_REFRESH_TOKEN')

  return c.json({ success: true, data: { csrf_token: signAdminCsrfToken(refreshToken) } })
})

// ─── Protected: SUPER_ADMIN only ──────────────────────────────────────────────

router.use('/admin/*', requireAuth, requireAdminCsrf, requireRole('SUPER_ADMIN'))

router.get('/admin/auth/me', async (c) => {
  const user = await adminService.getAdminMe(c.get('auth').sub)
  return c.json({ success: true, data: { user } })
})

router.get('/admin/metrics', async (c) => {
  const metrics = await adminService.getMetrics()
  return c.json({ success: true, data: metrics })
})

router.get('/admin/password-tickets', zValidator('query', ListPasswordTicketsQuerySchema), async (c) => {
  const query = c.req.valid('query')
  const result = await adminService.listPasswordTickets(query)
  return c.json({ success: true, ...result })
})

router.get('/admin/audit-logs', zValidator('query', ListAdminAuditLogsQuerySchema), async (c) => {
  const query = c.req.valid('query')
  const result = await adminService.listAdminAuditLogs(query)
  return c.json({ success: true, ...result })
})

router.patch('/admin/password-tickets/:id', zValidator('json', UpdatePasswordTicketSchema), async (c) => {
  const ticketId = c.req.param('id')
  const adminId = c.get('auth').sub
  const result = await adminService.updatePasswordTicket(ticketId, c.req.valid('json'), adminId)
  return c.json({ success: true, data: result })
})

router.post('/admin/password-tickets/:id/reset-link', async (c) => {
  const ticketId = c.req.param('id')
  const adminId = c.get('auth').sub
  const result = await adminService.issuePasswordResetLink(ticketId, adminId)
  return c.json({ success: true, data: result }, 201)
})

// ─── Doctor verification ───────────────────────────────────────────────────────

router.get('/admin/users', zValidator('query', ListUsersQuerySchema), async (c) => {
  const query = c.req.valid('query')
  const result = await adminService.listPendingDoctors(query)
  return c.json({ success: true, ...result })
})

router.post('/admin/users/:id/verify', async (c) => {
  const userId = c.req.param('id')
  const adminId = c.get('auth').sub
  const result = await adminService.verifyDoctor(userId, adminId)
  return c.json({ success: true, data: result })
})

router.post('/admin/users/:id/reject', zValidator('json', RejectDoctorSchema), async (c) => {
  const userId = c.req.param('id')
  const adminId = c.get('auth').sub
  const body = c.req.valid('json')
  const result = await adminService.rejectDoctor(userId, body, adminId)
  return c.json({ success: true, data: result })
})

// ─── Tenants ───────────────────────────────────────────────────────────────────

router.get('/admin/tenants', zValidator('query', ListTenantsQuerySchema), async (c) => {
  const query = c.req.valid('query')
  const result = await adminService.listTenants(query)
  return c.json({ success: true, ...result })
})

router.patch('/admin/tenants/:id', zValidator('json', UpdateTenantSchema), async (c) => {
  const tenantId = c.req.param('id')
  const adminId = c.get('auth').sub
  const body = c.req.valid('json')
  const result = await adminService.updateTenant(tenantId, body, adminId)
  return c.json({ success: true, data: result })
})

function setAdminSessionCookies(c: Parameters<typeof setCookie>[0], accessToken: string, refreshToken: string) {
  const secure = config.env === 'production'
  setCookie(c, ADMIN_ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: ADMIN_COOKIE_PATH,
    maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS,
  })
  setCookie(c, ADMIN_REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: ADMIN_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  })
}

function clearAdminSessionCookies(c: Parameters<typeof deleteCookie>[0]) {
  deleteCookie(c, ADMIN_ACCESS_COOKIE, { path: ADMIN_COOKIE_PATH })
  deleteCookie(c, ADMIN_REFRESH_COOKIE, { path: ADMIN_COOKIE_PATH })
}

async function requireAdminCsrf(c: Parameters<typeof requireAuth>[0], next: Parameters<typeof requireAuth>[1]) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    await next()
    return
  }

  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    await next()
    return
  }

  const refreshToken = getCookie(c, ADMIN_REFRESH_COOKIE)
  const csrfToken = c.req.header('X-CSRF-Token')
  if (!refreshToken || !csrfToken || !verifyAdminCsrfToken(refreshToken, csrfToken)) {
    throw new UnauthorizedError('Missing or invalid CSRF token', 'INVALID_CSRF_TOKEN')
  }

  await next()
}

export { router as adminRouter }
