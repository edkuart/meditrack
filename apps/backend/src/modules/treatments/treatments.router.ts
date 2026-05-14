import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { CreateTreatmentSchema, ConfirmDoseSchema, InterventionItemSchema, UpdateInterventionSchema } from './treatments.schema.ts'
import * as treatmentsService from './treatments.service.ts'

const router = new Hono()

router.use('*', requireAuth)

// POST /encounters/:encounterId/treatments
router.post(
  '/encounters/:encounterId/treatments',
  zValidator('json', CreateTreatmentSchema),
  async (c) => {
    const auth = c.get('auth')
    const plan = await treatmentsService.createTreatment(
      auth.tenant_id,
      auth.sub,
      auth.email,
      c.req.param('encounterId'),
      c.req.valid('json'),
    )
    return c.json({ success: true, data: plan }, 201)
  },
)

// GET /patients/:patientId/treatments
router.get('/patients/:patientId/treatments', async (c) => {
  const auth = c.get('auth')
  const plans = await treatmentsService.listTreatmentsByPatient(
    auth.tenant_id,
    c.req.param('patientId'),
  )
  return c.json({ success: true, data: plans })
})

// GET /treatments/:id
router.get('/treatments/:id', async (c) => {
  const auth = c.get('auth')
  const plan = await treatmentsService.getTreatmentById(auth.tenant_id, c.req.param('id'))
  return c.json({ success: true, data: plan })
})

// POST /treatments/:id/activate
router.post('/treatments/:id/activate', async (c) => {
  const auth = c.get('auth')
  const result = await treatmentsService.activateTreatment(
    auth.tenant_id,
    c.req.param('id'),
    auth.sub,
    auth.email,
  )
  return c.json({ success: true, data: result })
})

// PATCH /treatments/:id/suspend
router.patch('/treatments/:id/suspend', async (c) => {
  const auth = c.get('auth')
  const result = await treatmentsService.suspendTreatment(
    auth.tenant_id,
    c.req.param('id'),
    auth.sub,
    auth.email,
  )
  return c.json({ success: true, data: result })
})

// GET /treatments/:id/adherence
router.get('/treatments/:id/adherence', async (c) => {
  const auth = c.get('auth')
  const plan = await treatmentsService.getTreatmentById(auth.tenant_id, c.req.param('id'))
  const score = await treatmentsService.getAdherenceScore(plan.patient_id, plan.id)
  return c.json({ success: true, data: score })
})

// POST /treatments/:id/interventions — add intervention to an existing plan
router.post('/treatments/:id/interventions', zValidator('json', InterventionItemSchema), async (c) => {
  const auth = c.get('auth')
  const row = await treatmentsService.addIntervention(
    auth.tenant_id,
    c.req.param('id'),
    c.req.valid('json'),
  )
  return c.json({ success: true, data: row }, 201)
})

// PATCH /interventions/:id — update an intervention
router.patch('/interventions/:id', zValidator('json', UpdateInterventionSchema), async (c) => {
  const auth = c.get('auth')
  const row = await treatmentsService.updateIntervention(
    auth.tenant_id,
    c.req.param('id'),
    c.req.valid('json'),
  )
  return c.json({ success: true, data: row })
})

// DELETE /interventions/:id — soft-delete
router.delete('/interventions/:id', async (c) => {
  const auth = c.get('auth')
  await treatmentsService.deleteIntervention(auth.tenant_id, c.req.param('id'))
  return c.json({ success: true })
})

// POST /doses/:id/confirm  (used by patient portal — auth handled separately)
router.post('/doses/:id/confirm', zValidator('json', ConfirmDoseSchema), async (c) => {
  const auth = c.get('auth')
  // For now, doctor can also confirm on behalf of patient
  const plan = await treatmentsService.getTreatmentById(auth.tenant_id, c.req.param('id'))
    .catch(() => null)

  const confirmed = await treatmentsService.confirmDose(
    auth.sub,
    c.req.param('id'),
    c.req.valid('json'),
    'doctor_portal',
  )
  return c.json({ success: true, data: confirmed })
})

export { router as treatmentsRouter }
