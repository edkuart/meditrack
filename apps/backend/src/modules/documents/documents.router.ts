import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { requireAuth } from '../../shared/middleware/auth.middleware.ts'
import { PERMISSIONS, requirePermission } from '../../shared/permissions.ts'
import { ValidationError } from '../../shared/errors.ts'
import { UploadDocumentSchema, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from './documents.schema.ts'
import * as documentsService from './documents.service.ts'
import {
  StartDocumentProcessingSchema,
  SubmitDocumentExtractionSchema,
} from '../clinical-intelligence/clinical-intelligence.schema.ts'
import * as clinicalIntelligenceService from '../clinical-intelligence/clinical-intelligence.service.ts'

const router = new Hono()

router.use('*', requireAuth)

// POST /patients/:patientId/documents  (multipart/form-data)
router.post('/patients/:patientId/documents', requirePermission(PERMISSIONS.DOCUMENT_WRITE), async (c) => {
  const auth = c.get('auth')
  const patientId = c.req.param('patientId')!

  const formData = await c.req.formData().catch(() => {
    throw new ValidationError('Expected multipart/form-data')
  })

  const file = formData.get('file')
  if (!(file instanceof File)) {
    throw new ValidationError('Missing "file" field in form data')
  }

  // Parse metadata fields from form data
  const meta = UploadDocumentSchema.parse({
    type: formData.get('type') ?? 'OTHER',
    is_visible_to_patient: formData.get('is_visible_to_patient') ?? 'false',
    encounter_id: formData.get('encounter_id') ?? undefined,
  })

  const doc = await documentsService.uploadDocument(
    auth.tenant_id, patientId, auth.sub, auth.email, file, meta,
  )

  return c.json({ success: true, data: doc }, 201)
})

// GET /patients/:patientId/documents
router.get('/patients/:patientId/documents', requirePermission(PERMISSIONS.DOCUMENT_READ), async (c) => {
  const auth = c.get('auth')
  const docs = await documentsService.listPatientDocuments(
    auth.tenant_id, c.req.param('patientId')!,
  )
  return c.json({ success: true, data: docs })
})

// GET /documents/:id/url  — returns a signed URL for viewing
router.get('/documents/:id/url', requirePermission(PERMISSIONS.DOCUMENT_READ), async (c) => {
  const auth = c.get('auth')
  const result = await documentsService.getDocumentUrl(
    auth.tenant_id, c.req.param('id')!, auth.sub, auth.email,
  )
  return c.json({ success: true, data: result })
})

// GET /documents/:id/processing-jobs
router.get('/documents/:id/processing-jobs', requirePermission(PERMISSIONS.DOCUMENT_PROCESS), async (c) => {
  const auth = c.get('auth')
  const jobs = await clinicalIntelligenceService.listDocumentProcessingJobs(
    auth.tenant_id,
    c.req.param('id')!,
  )
  return c.json({ success: true, data: jobs })
})

// POST /documents/:id/process — starts local triage or queues an external/manual extraction pass
router.post(
  '/documents/:id/process',
  requirePermission(PERMISSIONS.DOCUMENT_PROCESS),
  zValidator('json', StartDocumentProcessingSchema),
  async (c) => {
    const auth = c.get('auth')
    const job = await clinicalIntelligenceService.startDocumentProcessing(
      auth.tenant_id,
      c.req.param('id')!,
      auth.sub,
      auth.email,
      c.req.valid('json'),
    )
    return c.json({ success: true, data: job }, 201)
  },
)

// POST /documents/:id/extractions — submits OCR/AI/manual findings into the review queue
router.post(
  '/documents/:id/extractions',
  requirePermission(PERMISSIONS.DOCUMENT_PROCESS),
  zValidator('json', SubmitDocumentExtractionSchema),
  async (c) => {
    const auth = c.get('auth')
    const result = await clinicalIntelligenceService.submitDocumentExtraction(
      auth.tenant_id,
      c.req.param('id')!,
      auth.sub,
      auth.email,
      c.req.valid('json'),
    )
    return c.json({ success: true, data: result }, 201)
  },
)

// PATCH /documents/:id/visibility
router.patch(
  '/documents/:id/visibility',
  requirePermission(PERMISSIONS.DOCUMENT_VISIBILITY_WRITE),
  zValidator('json', z.object({ is_visible_to_patient: z.boolean() })),
  async (c) => {
    const auth = c.get('auth')
    const { is_visible_to_patient } = c.req.valid('json')
    const doc = await documentsService.togglePatientVisibility(
      auth.tenant_id, c.req.param('id')!, is_visible_to_patient,
    )
    return c.json({ success: true, data: doc })
  },
)

// DELETE /documents/:id
router.delete('/documents/:id', requirePermission(PERMISSIONS.DOCUMENT_DELETE), async (c) => {
  const auth = c.get('auth')
  await documentsService.deleteDocument(
    auth.tenant_id, c.req.param('id')!, auth.sub, auth.email,
  )
  return c.json({ success: true, data: null })
})

// Internal: serve local files in dev (only active when storage not configured)
router.get('/internal/files/:key{.+}', async (c) => {
  if (process.env.STORAGE_ENDPOINT) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, 404)
  }
  const key = decodeURIComponent(c.req.param('key')!)
  const { join } = await import('path')
  const { readFileSync, existsSync } = await import('fs')
  const localPath = join(process.cwd(), 'uploads', key)
  if (!existsSync(localPath)) return c.notFound()
  const buffer = readFileSync(localPath)
  const ext = key.split('.').pop() ?? 'bin'
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp',
  }
  return new Response(buffer, {
    headers: { 'Content-Type': mimeMap[ext] ?? 'application/octet-stream' },
  })
})

export { router as documentsRouter }
