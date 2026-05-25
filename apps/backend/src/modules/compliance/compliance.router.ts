import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { PERMISSIONS, requirePermission } from '../../shared/permissions.ts'
import {
  getPatientConsents,
  recordConsent,
  withdrawConsent,
  exportPatientData,
  anonymizePatient,
  acceptLegal,
  getLegalStatus,
} from './compliance.service.ts'

const router = new Hono()
router.use('*', requireAuth)

// ─── Consent ──────────────────────────────────────────────────────────────────

router.get('/compliance/patients/:patientId/consents', async (c) => {
  const { tenant_id } = c.get('auth')
  const data = await getPatientConsents(tenant_id, c.req.param('patientId')!)
  return c.json({ success: true, data })
})

router.post(
  '/compliance/patients/:patientId/consents',
  zValidator('json', z.object({
    consent_type: z.enum(['data_processing', 'treatment', 'third_party_sharing', 'research', 'marketing']),
    description: z.string().max(500).optional(),
    consented_at: z.string().datetime(),
    ip_address: z.string().max(45).optional(),
    notes: z.string().max(1000).optional(),
  })),
  async (c) => {
    const { tenant_id, sub, email } = c.get('auth')
    const data = await recordConsent(tenant_id, c.req.param('patientId')!, sub, email, c.req.valid('json'))
    return c.json({ success: true, data }, 201)
  },
)

router.delete('/compliance/patients/:patientId/consents/:consentId', async (c) => {
  const { tenant_id, sub, email } = c.get('auth')
  await withdrawConsent(tenant_id, c.req.param('patientId')!, c.req.param('consentId')!, sub, email)
  return c.json({ success: true, data: null })
})

// ─── Data export (GDPR portability) ──────────────────────────────────────────

router.get('/compliance/patients/:patientId/export', async (c) => {
  const { tenant_id, sub, email } = c.get('auth')
  const data = await exportPatientData(tenant_id, c.req.param('patientId')!, sub, email)

  c.header('Content-Disposition', `attachment; filename="patient-${c.req.param('patientId')}-export.json"`)
  c.header('Content-Type', 'application/json')
  return c.json({ success: true, data })
})

// ─── PII anonymization (GDPR erasure) — admin only ───────────────────────────

router.delete(
  '/compliance/patients/:patientId/pii',
  requirePermission(PERMISSIONS.HOSPITAL_MANAGE),
  async (c) => {
    const { tenant_id, sub, email } = c.get('auth')
    const data = await anonymizePatient(tenant_id, c.req.param('patientId')!, sub, email)
    return c.json({ success: true, data })
  },
)

// ─── Legal acceptance ─────────────────────────────────────────────────────────

router.get('/compliance/legal/status', async (c) => {
  const { sub } = c.get('auth')
  const data = await getLegalStatus(sub)
  return c.json({ success: true, data })
})

router.post(
  '/compliance/legal/accept',
  zValidator('json', z.object({
    type: z.enum(['tos', 'privacy']),
  })),
  async (c) => {
    const { sub, tenant_id, email } = c.get('auth')
    const { type } = c.req.valid('json')
    const data = await acceptLegal(sub, tenant_id, email, type)
    return c.json({ success: true, data })
  },
)

export { router as complianceRouter }
