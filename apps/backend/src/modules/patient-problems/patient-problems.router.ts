import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { CreateProblemSchema, UpdateProblemSchema } from './patient-problems.schema.ts'
import * as problemsService from './patient-problems.service.ts'

const router = new Hono()

router.use('*', requireAuth)

// GET /patients/:patientId/problems
router.get('/patients/:patientId/problems', async (c) => {
  const auth = c.get('auth')
  const list = await problemsService.listProblems(auth.tenant_id, c.req.param('patientId'))
  return c.json({ success: true, data: list })
})

// POST /patients/:patientId/problems
router.post('/patients/:patientId/problems', zValidator('json', CreateProblemSchema), async (c) => {
  const auth = c.get('auth')
  const problem = await problemsService.createProblem(
    auth.tenant_id,
    c.req.param('patientId'),
    auth.sub,
    auth.email,
    c.req.valid('json'),
  )
  return c.json({ success: true, data: problem }, 201)
})

// PATCH /problems/:id
router.patch('/problems/:id', zValidator('json', UpdateProblemSchema), async (c) => {
  const auth = c.get('auth')
  const problem = await problemsService.updateProblem(
    auth.tenant_id,
    c.req.param('id'),
    auth.sub,
    auth.email,
    c.req.valid('json'),
  )
  return c.json({ success: true, data: problem })
})

export { router as patientProblemsRouter }
