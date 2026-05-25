import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { PERMISSIONS, requirePermission } from '../../shared/permissions.ts'
import {
  ListClinicalProtocolsQuerySchema,
  CreateProtocolSchema,
  UpdateProtocolSchema,
} from './clinical-protocols.schema.ts'
import * as clinicalProtocolsService from './clinical-protocols.service.ts'

const router = new Hono()

router.use('*', requireAuth)

router.get('/clinical-protocols', requirePermission(PERMISSIONS.TREATMENT_READ), zValidator('query', ListClinicalProtocolsQuerySchema), async (c) => {
  const auth = c.get('auth')
  const protocols = await clinicalProtocolsService.listClinicalProtocols(auth.tenant_id, c.req.valid('query'))
  return c.json({ success: true, data: protocols })
})

router.post(
  '/clinical-protocols',
  requirePermission(PERMISSIONS.TREATMENT_WRITE),
  zValidator('json', CreateProtocolSchema),
  async (c) => {
    const { tenant_id } = c.get('auth')
    const protocol = await clinicalProtocolsService.createProtocol(tenant_id, c.req.valid('json'))
    return c.json({ success: true, data: protocol }, 201)
  },
)

router.patch(
  '/clinical-protocols/:id',
  requirePermission(PERMISSIONS.TREATMENT_WRITE),
  zValidator('json', UpdateProtocolSchema),
  async (c) => {
    const { tenant_id } = c.get('auth')
    const protocol = await clinicalProtocolsService.updateProtocol(
      tenant_id,
      c.req.param('id')!,
      c.req.valid('json'),
    )
    return c.json({ success: true, data: protocol })
  },
)

router.delete('/clinical-protocols/:id', requirePermission(PERMISSIONS.TREATMENT_WRITE), async (c) => {
  const { tenant_id } = c.get('auth')
  await clinicalProtocolsService.deleteProtocol(tenant_id, c.req.param('id')!)
  return c.json({ success: true, data: null })
})

export { router as clinicalProtocolsRouter }
