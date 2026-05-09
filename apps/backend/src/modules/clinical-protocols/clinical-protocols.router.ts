import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { ListClinicalProtocolsQuerySchema } from './clinical-protocols.schema.ts'
import * as clinicalProtocolsService from './clinical-protocols.service.ts'

const router = new Hono()

router.use('*', requireAuth)

router.get('/clinical-protocols', zValidator('query', ListClinicalProtocolsQuerySchema), async (c) => {
  const auth = c.get('auth')
  const protocols = await clinicalProtocolsService.listClinicalProtocols(auth.tenant_id, c.req.valid('query'))
  return c.json({ success: true, data: protocols })
})

export { router as clinicalProtocolsRouter }
