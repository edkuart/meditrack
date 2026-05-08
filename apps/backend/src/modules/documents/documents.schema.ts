import { z } from 'zod'

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20MB

export const DocumentType = z.enum([
  'PRESCRIPTION',
  'LAB_RESULT',
  'IMAGING',
  'CONSENT',
  'CLINICAL_NOTE',
  'OTHER',
])

export const UploadDocumentSchema = z.object({
  type: DocumentType.default('OTHER'),
  is_visible_to_patient: z.coerce.boolean().default(false),
  encounter_id: z.string().uuid().optional(),
})

export type UploadDocumentInput = z.infer<typeof UploadDocumentSchema>
