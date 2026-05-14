import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import {
  CreateProvenanceSchema,
  CreateClinicalTranscriptSchema,
  CreateReviewItemSchema,
  ListReviewItemsSchema,
  ReviewClinicalTranscriptSchema,
  ResolveReviewItemSchema,
} from './clinical-intelligence.schema.ts'
import * as clinicalIntelligenceService from './clinical-intelligence.service.ts'

const router = new Hono()

router.use('*', requireAuth)

// GET /patients/:patientId/clinical/summary
router.get('/patients/:patientId/clinical/summary', async (c) => {
  const auth = c.get('auth')
  const summary = await clinicalIntelligenceService.getClinicalSummary(auth.tenant_id, c.req.param('patientId'))
  return c.json({ success: true, data: summary })
})

// GET /patients/:patientId/clinical/transcripts
router.get('/patients/:patientId/clinical/transcripts', async (c) => {
  const auth = c.get('auth')
  const rows = await clinicalIntelligenceService.listClinicalTranscripts(auth.tenant_id, c.req.param('patientId'))
  return c.json({ success: true, data: rows })
})

// POST /patients/:patientId/clinical/transcripts
router.post(
  '/patients/:patientId/clinical/transcripts',
  zValidator('json', CreateClinicalTranscriptSchema),
  async (c) => {
    const auth = c.get('auth')
    const result = await clinicalIntelligenceService.createClinicalTranscript(
      auth.tenant_id,
      c.req.param('patientId'),
      auth.sub,
      auth.email,
      c.req.valid('json'),
    )
    return c.json({ success: true, data: result }, 201)
  },
)

// PATCH /clinical/transcripts/:id
router.patch('/clinical/transcripts/:id', zValidator('json', ReviewClinicalTranscriptSchema), async (c) => {
  const auth = c.get('auth')
  const row = await clinicalIntelligenceService.reviewClinicalTranscript(
    auth.tenant_id,
    c.req.param('id'),
    auth.sub,
    auth.email,
    c.req.valid('json'),
  )
  return c.json({ success: true, data: row })
})

// GET /patients/:patientId/clinical/provenance
router.get('/patients/:patientId/clinical/provenance', async (c) => {
  const auth = c.get('auth')
  const rows = await clinicalIntelligenceService.listProvenance(auth.tenant_id, c.req.param('patientId'))
  return c.json({ success: true, data: rows })
})

// POST /patients/:patientId/clinical/provenance
router.post(
  '/patients/:patientId/clinical/provenance',
  zValidator('json', CreateProvenanceSchema),
  async (c) => {
    const auth = c.get('auth')
    const row = await clinicalIntelligenceService.recordProvenance(
      auth.tenant_id,
      c.req.param('patientId'),
      auth.sub,
      auth.email,
      c.req.valid('json'),
    )
    return c.json({ success: true, data: row }, 201)
  },
)

// GET /patients/:patientId/clinical/review-items?status=PENDING
router.get(
  '/patients/:patientId/clinical/review-items',
  zValidator('query', ListReviewItemsSchema),
  async (c) => {
    const auth = c.get('auth')
    const rows = await clinicalIntelligenceService.listReviewItems(
      auth.tenant_id,
      c.req.param('patientId'),
      c.req.valid('query'),
    )
    return c.json({ success: true, data: rows })
  },
)

// POST /patients/:patientId/clinical/review-items
router.post(
  '/patients/:patientId/clinical/review-items',
  zValidator('json', CreateReviewItemSchema),
  async (c) => {
    const auth = c.get('auth')
    const row = await clinicalIntelligenceService.createReviewItem(
      auth.tenant_id,
      c.req.param('patientId'),
      auth.sub,
      auth.email,
      c.req.valid('json'),
    )
    return c.json({ success: true, data: row }, 201)
  },
)

// PATCH /clinical/review-items/:id
router.patch('/clinical/review-items/:id', zValidator('json', ResolveReviewItemSchema), async (c) => {
  const auth = c.get('auth')
  const row = await clinicalIntelligenceService.resolveReviewItem(
    auth.tenant_id,
    c.req.param('id'),
    auth.sub,
    auth.email,
    c.req.valid('json'),
  )
  return c.json({ success: true, data: row })
})

export { router as clinicalIntelligenceRouter }
