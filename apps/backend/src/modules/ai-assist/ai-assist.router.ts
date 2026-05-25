import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { PERMISSIONS, requirePermission } from '../../shared/permissions.ts'
import { ClinicalCopilotSchema, EncounterAiAssistSchema } from './ai-assist.schema.ts'
import * as aiAssistService from './ai-assist.service.ts'

const router = new Hono()

router.use('*', requireAuth)

router.post('/encounters/:id/ai-assist', requirePermission(PERMISSIONS.ENCOUNTER_WRITE), zValidator('json', EncounterAiAssistSchema), async (c) => {
  const auth = c.get('auth')
  const draft = await aiAssistService.assistEncounter(
    auth.tenant_id,
    auth.sub,
    auth.email,
    c.req.param('id'),
    c.req.valid('json'),
  )
  return c.json({ success: true, data: draft })
})

router.post('/patients/:patientId/clinical-copilot', requirePermission(PERMISSIONS.PATIENT_SENSITIVE_READ), zValidator('json', ClinicalCopilotSchema), async (c) => {
  const auth = c.get('auth')
  const draft = await aiAssistService.runClinicalCopilot(
    auth.tenant_id,
    auth.sub,
    auth.email,
    c.req.param('patientId'),
    c.req.valid('json'),
  )
  return c.json({ success: true, data: draft })
})

export { router as aiAssistRouter }
