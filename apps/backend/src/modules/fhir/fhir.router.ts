import { Hono } from 'hono'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { PERMISSIONS, requirePermission } from '../../shared/permissions.ts'
import { buildPatientFhirBundle } from './fhir.service.ts'

const router = new Hono()

// GET /api/v1/patients/:id/fhir  — FHIR R4 Bundle for a patient
router.get('/patients/:id/fhir', requireAuth, requirePermission(PERMISSIONS.PATIENT_SENSITIVE_READ), async (c) => {
  const auth = c.get('auth')
  const patientId = c.req.param('id') as string
  const bundle = await buildPatientFhirBundle(auth.tenant_id, patientId)
  return c.json({ success: true, data: bundle })
})

export { router as fhirRouter }
