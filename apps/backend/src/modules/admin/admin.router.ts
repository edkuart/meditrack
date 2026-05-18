import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import {
  AdminLoginSchema,
  RejectDoctorSchema,
  ListUsersQuerySchema,
  ListTenantsQuerySchema,
  UpdateTenantSchema,
} from './admin.schema.ts'
import * as adminService from './admin.service.ts'
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware.ts'
import { rateLimit } from '../../shared/middleware/rate-limit.middleware.ts'

const router = new Hono()

const loginLimiter = rateLimit({ keyPrefix: 'admin-login', windowMs: 15 * 60 * 1000, max: 5 })

// ─── Public: admin login (SUPER_ADMIN only) ────────────────────────────────────

router.post('/admin/auth/login', loginLimiter, zValidator('json', AdminLoginSchema), async (c) => {
  const body = c.req.valid('json')
  const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip')
  const ua = c.req.header('user-agent')
  const result = await adminService.adminLogin(body, ip, ua)
  return c.json({ success: true, data: result })
})

// ─── Protected: SUPER_ADMIN only ──────────────────────────────────────────────

router.use('/admin/*', requireAuth, requireRole('SUPER_ADMIN'))

router.get('/admin/metrics', async (c) => {
  const metrics = await adminService.getMetrics()
  return c.json({ success: true, data: metrics })
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

export { router as adminRouter }
