import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware.ts'
import { grantDepartmentAccess, revokeDepartmentAccess, listPatientAccess } from './access.service.ts'

const GrantAccessSchema = z.object({
  department_id: z.string().uuid(),
  access_type: z.enum(['FULL', 'READ_ONLY', 'LAB_ONLY']).default('READ_ONLY'),
  expires_at: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
})

const router = new Hono()

router.use('*', requireAuth)

// GET /patients/:patientId/access
router.get(
  '/patients/:patientId/access',
  requireRole('ADMIN_CLINIC', 'DOCTOR'),
  async (c) => {
    const { tenant_id } = c.get('auth')
    const grants = await listPatientAccess(tenant_id, c.req.param('patientId')!)
    return c.json({ success: true, data: grants })
  },
)

// POST /patients/:patientId/access
router.post(
  '/patients/:patientId/access',
  requireRole('ADMIN_CLINIC', 'DOCTOR'),
  zValidator('json', GrantAccessSchema),
  async (c) => {
    const { tenant_id, sub, email } = c.get('auth')
    const body = c.req.valid('json')
    const record = await grantDepartmentAccess(
      tenant_id,
      sub,
      email,
      c.req.param('patientId')!,
      body.department_id,
      body.access_type,
      {
        expires_at: body.expires_at ? new Date(body.expires_at) : undefined,
        notes: body.notes,
      },
    )
    return c.json({ success: true, data: record }, 201)
  },
)

// DELETE /patients/:patientId/access/:departmentId
router.delete(
  '/patients/:patientId/access/:departmentId',
  requireRole('ADMIN_CLINIC', 'DOCTOR'),
  async (c) => {
    const { tenant_id, sub, email } = c.get('auth')
    await revokeDepartmentAccess(
      tenant_id,
      sub,
      email,
      c.req.param('patientId')!,
      c.req.param('departmentId')!,
    )
    return c.json({ success: true })
  },
)

export { router as accessRouter }
