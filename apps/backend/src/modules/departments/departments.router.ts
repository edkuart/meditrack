import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { PERMISSIONS, requirePermission } from '../../shared/permissions.ts'
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
  AddMemberSchema,
} from './departments.schema.ts'
import * as deptService from './departments.service.ts'

const router = new Hono()

router.use('*', requireAuth)

// ─── Tenant upgrade ────────────────────────────────────────────────────────────

router.post('/hospital/upgrade', requirePermission(PERMISSIONS.HOSPITAL_MANAGE), async (c) => {
  const { tenant_id, sub } = c.get('auth')
  const result = await deptService.upgradeTenantToHospital(tenant_id, sub)
  return c.json({ success: true, data: result })
})

// ─── Departments ───────────────────────────────────────────────────────────────

router.get('/departments', requirePermission(PERMISSIONS.HOSPITAL_CENSUS_READ), async (c) => {
  const { tenant_id } = c.get('auth')
  const data = await deptService.listDepartments(tenant_id)
  return c.json({ success: true, data })
})

router.post('/departments', requirePermission(PERMISSIONS.HOSPITAL_MANAGE), zValidator('json', CreateDepartmentSchema), async (c) => {
  const { tenant_id, sub } = c.get('auth')
  const body = c.req.valid('json')
  const dept = await deptService.createDepartment(tenant_id, body, sub)
  return c.json({ success: true, data: dept }, 201)
})

router.get('/departments/:id', requirePermission(PERMISSIONS.HOSPITAL_CENSUS_READ), async (c) => {
  const { tenant_id } = c.get('auth')
  const dept = await deptService.getDepartment(tenant_id, c.req.param('id')!)
  return c.json({ success: true, data: dept })
})

router.patch('/departments/:id', requirePermission(PERMISSIONS.HOSPITAL_MANAGE), zValidator('json', UpdateDepartmentSchema), async (c) => {
  const { tenant_id, sub } = c.get('auth')
  const dept = await deptService.updateDepartment(tenant_id, c.req.param('id')!, c.req.valid('json'), sub)
  return c.json({ success: true, data: dept })
})

router.delete('/departments/:id', requirePermission(PERMISSIONS.HOSPITAL_MANAGE), async (c) => {
  const { tenant_id, sub } = c.get('auth')
  const result = await deptService.deleteDepartment(tenant_id, c.req.param('id')!, sub)
  return c.json({ success: true, data: result })
})

// ─── Members ───────────────────────────────────────────────────────────────────

router.post('/departments/:id/members', requirePermission(PERMISSIONS.HOSPITAL_MANAGE), zValidator('json', AddMemberSchema), async (c) => {
  const { tenant_id, sub } = c.get('auth')
  const result = await deptService.addMember(tenant_id, c.req.param('id')!, c.req.valid('json'), sub)
  return c.json({ success: true, data: result })
})

router.delete('/departments/:id/members/:userId', requirePermission(PERMISSIONS.HOSPITAL_MANAGE), async (c) => {
  const { tenant_id, sub } = c.get('auth')
  const result = await deptService.removeMember(tenant_id, c.req.param('id')!, c.req.param('userId')!, sub)
  return c.json({ success: true, data: result })
})

export { router as departmentsRouter }
