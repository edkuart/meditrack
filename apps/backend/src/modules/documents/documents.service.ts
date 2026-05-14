import { createHash } from 'crypto'
import { eq, and } from 'drizzle-orm'
import { db, documents, patients } from '../../shared/db/index.ts'
import { uploadFile, getSignedViewUrl, deleteFile, buildStorageKey } from '../../shared/storage/storage.service.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { NotFoundError, ValidationError } from '../../shared/errors.ts'
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, type UploadDocumentInput } from './documents.schema.ts'
import { recordProvenance } from '../clinical-intelligence/clinical-intelligence.service.ts'

// ─── Upload ────────────────────────────────────────────────────────────────────

export async function uploadDocument(
  tenantId: string,
  patientId: string,
  doctorId: string,
  doctorEmail: string,
  file: File,
  input: UploadDocumentInput,
) {
  // Validate patient belongs to tenant
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type as typeof ALLOWED_MIME_TYPES[number])) {
    throw new ValidationError(
      `File type not allowed. Accepted: ${ALLOWED_MIME_TYPES.join(', ')}`,
      { received: file.type },
    )
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(`File too large. Maximum size is 20MB`, { size: file.size })
  }

  // Read file into buffer
  const buffer = Buffer.from(await file.arrayBuffer())

  // Compute SHA-256 checksum
  const checksum = createHash('sha256').update(buffer).digest('hex')

  // Create DB record first to get the document ID for the storage key
  const [doc] = await db.insert(documents).values({
    tenant_id: tenantId,
    patient_id: patientId,
    encounter_id: input.encounter_id,
    uploaded_by: doctorId,
    type: input.type,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type,
    storage_key: 'pending', // Will update after upload
    checksum,
    is_visible_to_patient: input.is_visible_to_patient,
  }).returning()

  // Build storage key and upload
  const storageKey = buildStorageKey(tenantId, patientId, doc.id, file.name)

  await uploadFile(storageKey, buffer, file.type)

  // Update record with final storage key
  const [updated] = await db
    .update(documents)
    .set({ storage_key: storageKey })
    .where(eq(documents.id, doc.id))
    .returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: doctorId,
    actor_type: 'USER',
    actor_email: doctorEmail,
    action: 'DOCUMENT_UPLOADED',
    resource_type: 'DOCUMENT',
    resource_id: doc.id,
    context: {
      patient_id: patientId,
      file_name: file.name,
      file_size: file.size,
      type: input.type,
    },
  })

  await recordProvenance(tenantId, patientId, doctorId, doctorEmail, {
    encounter_id: input.encounter_id,
    document_id: doc.id,
    source_type: 'DOCUMENT_UPLOAD',
    source_resource_type: 'DOCUMENT',
    source_resource_id: doc.id,
    source_label: file.name,
    source_checksum: checksum,
    target_resource_type: 'DOCUMENT',
    target_resource_id: doc.id,
    extraction_method: 'UPLOAD',
    metadata: {
      document_type: input.type,
      mime_type: file.type,
      file_size: file.size,
    },
  })

  return sanitizeDocument(updated)
}

// ─── List ──────────────────────────────────────────────────────────────────────

export async function listPatientDocuments(tenantId: string, patientId: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')

  return db.query.documents.findMany({
    where: and(eq(documents.tenant_id, tenantId), eq(documents.patient_id, patientId)),
    columns: {
      id: true, type: true, file_name: true, file_size: true,
      mime_type: true, is_visible_to_patient: true,
      encounter_id: true, created_at: true,
    },
    with: {
      uploaded_by_user: { columns: { first_name: true, last_name: true } },
    },
    orderBy: (d, { desc }) => desc(d.created_at),
  })
}

// ─── Get signed URL ────────────────────────────────────────────────────────────

export async function getDocumentUrl(
  tenantId: string,
  documentId: string,
  actorId: string,
  actorEmail: string,
) {
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.tenant_id, tenantId), eq(documents.id, documentId)),
    columns: { id: true, storage_key: true, file_name: true, mime_type: true },
  })
  if (!doc) throw new NotFoundError('Document')

  const url = await getSignedViewUrl(doc.storage_key, 900) // 15 minutes

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'DOCUMENT_VIEWED',
    resource_type: 'DOCUMENT',
    resource_id: documentId,
  })

  return { url, expires_in_seconds: 900, file_name: doc.file_name, mime_type: doc.mime_type }
}

// ─── Delete (hard — removes from storage and DB) ──────────────────────────────

export async function deleteDocument(
  tenantId: string,
  documentId: string,
  actorId: string,
  actorEmail: string,
) {
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.tenant_id, tenantId), eq(documents.id, documentId)),
    columns: { id: true, storage_key: true },
  })
  if (!doc) throw new NotFoundError('Document')

  // Delete from storage first, then DB
  await deleteFile(doc.storage_key)

  await db.delete(documents).where(eq(documents.id, documentId))

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'DOCUMENT_DELETED',
    resource_type: 'DOCUMENT',
    resource_id: documentId,
  })
}

// ─── Toggle patient visibility ─────────────────────────────────────────────────

export async function togglePatientVisibility(
  tenantId: string,
  documentId: string,
  visible: boolean,
) {
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.tenant_id, tenantId), eq(documents.id, documentId)),
    columns: { id: true },
  })
  if (!doc) throw new NotFoundError('Document')

  const [updated] = await db
    .update(documents)
    .set({ is_visible_to_patient: visible })
    .where(eq(documents.id, documentId))
    .returning()

  return sanitizeDocument(updated)
}

function sanitizeDocument(doc: typeof documents.$inferSelect) {
  // Never expose storage_key in API responses
  const { storage_key, ...safe } = doc
  return safe
}
