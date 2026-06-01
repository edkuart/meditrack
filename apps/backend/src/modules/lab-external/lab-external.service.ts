import { eq, and, sql } from 'drizzle-orm'
import { db } from '../../shared/db/index.ts'
import {
  labExternalSubmissions, labSubmissionFiles, labExtractedValues,
  labOrders, labResults, patients, encounters,
} from '../../shared/db/index.ts'
import { uploadFile, getSignedViewUrl, buildStorageKey } from '../../shared/storage/storage.service.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { NotFoundError, ValidationError } from '../../shared/errors.ts'
import { createDoctorNotification } from '../doctor-notifications/doctor-notifications.service.ts'
import type { SubmitExternalLabInput, UpdateExtractedValueInput } from './lab-external.schema.ts'

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSubmissionStorageKey(tenantId: string, patientId: string, submissionId: string, fileName: string) {
  const ext = fileName.split('.').pop() ?? 'bin'
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  return `external-lab/${tenantId}/${patientId}/${submissionId}/${safe}`
}

// ─── Patient submits external lab results ─────────────────────────────────────

export async function submitExternalLab(
  tenantId: string,
  patientId: string,
  files: File[],
  input: SubmitExternalLabInput,
) {
  if (files.length === 0) throw new ValidationError('At least one file is required')
  if (files.length > 5) throw new ValidationError('Maximum 5 files per submission')

  for (const f of files) {
    if (!ALLOWED_MIME_TYPES.includes(f.type as typeof ALLOWED_MIME_TYPES[number])) {
      throw new ValidationError(`File type not allowed: ${f.type}. Accepted: PDF, JPG, PNG, WebP`)
    }
    if (f.size > MAX_FILE_SIZE) {
      throw new ValidationError(`File too large: ${f.name}. Maximum 20MB`)
    }
  }

  if (input.order_id) {
    const order = await db.query.labOrders.findFirst({
      where: and(
        eq(labOrders.tenant_id, tenantId),
        eq(labOrders.id, input.order_id),
        eq(labOrders.patient_id, patientId),
      ),
      columns: { id: true },
    })
    if (!order) throw new NotFoundError('LabOrder')
  }

  const [submission] = await db
    .insert(labExternalSubmissions)
    .values({
      tenant_id:     tenantId,
      patient_id:    patientId,
      order_id:      input.order_id,
      patient_notes: input.patient_notes,
      status:        'RECEIVED',
    })
    .returning()

  // Upload files
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer())
    const storageKey = buildSubmissionStorageKey(tenantId, patientId, submission.id, file.name)
    await uploadFile(storageKey, buffer, file.type)

    await db.insert(labSubmissionFiles).values({
      submission_id: submission.id,
      tenant_id:     tenantId,
      patient_id:    patientId,
      file_name:     file.name,
      file_size:     file.size,
      mime_type:     file.type,
      storage_key:   storageKey,
    })
  }

  await createAuditLog({
    tenant_id:     tenantId,
    actor_id:      patientId,
    actor_type:    'PATIENT',
    actor_email:   '',
    action:        'LAB_EXTERNAL_SUBMITTED',
    resource_type: 'LAB_ORDER',
    resource_id:   submission.id,
    context:       { order_id: input.order_id, file_count: files.length },
  })

  // In-app feed: notify treating doctor when patient submits external lab results
  try {
    const [patient, lastEnc] = await Promise.all([
      db.query.patients.findFirst({
        where: eq(patients.id, patientId),
        columns: { first_name: true, last_name: true },
      }),
      db.query.encounters.findFirst({
        where: and(eq(encounters.patient_id, patientId), eq(encounters.tenant_id, tenantId)),
        orderBy: (e, { desc }) => desc(e.created_at),
        columns: { doctor_id: true },
      }),
    ])

    if (lastEnc?.doctor_id && patient) {
      const patientName = `${patient.first_name} ${patient.last_name}`
      const fileLabel = files.length === 1 ? '1 archivo' : `${files.length} archivos`
      await createDoctorNotification({
        tenant_id:    tenantId,
        recipient_id: lastEnc.doctor_id,
        patient_id:   patientId,
        type:         'EXTERNAL_LAB_SUBMITTED',
        title:        `${patientName} envió resultados de laboratorio`,
        body:         `${fileLabel} adjunto${files.length > 1 ? 's' : ''} desde su portal. Pendiente de revisión y validación.${input.patient_notes ? ` Nota: "${input.patient_notes}"` : ''}`,
        metadata: {
          submission_id:  submission.id,
          file_count:     files.length,
          file_names:     files.map(f => f.name),
          patient_notes:  input.patient_notes ?? null,
        },
      })
    }
  } catch { /* notification failure must not block submission */ }

  return getSubmission(tenantId, submission.id)
}

// ─── List submissions for tenant ──────────────────────────────────────────────

export async function listSubmissions(tenantId: string, statusFilter?: string, orderId?: string) {
  const rows = await db.execute(sql`
    select
      s.id,
      s.tenant_id,
      s.order_id,
      s.patient_id,
      s.status,
      s.patient_notes,
      s.submitted_at,
      s.reviewed_at,
      s.ai_started_at,
      s.ai_completed_at,
      s.created_at,
      s.updated_at,
      p.first_name  as patient__first_name,
      p.last_name   as patient__last_name,
      p.date_of_birth as patient__dob,
      (select count(*) from lab_extracted_values ev where ev.submission_id = s.id)::int as extracted_count,
      (select count(*) from lab_submission_files lf where lf.submission_id = s.id)::int as file_count
    from lab_external_submissions s
    left join patients p on p.id = s.patient_id
    where s.tenant_id = ${tenantId}
      ${statusFilter ? sql`and s.status = ${statusFilter}` : sql``}
      ${orderId ? sql`and s.order_id = ${orderId}` : sql``}
    order by s.submitted_at desc
    limit 200
  `)

  return (Array.isArray(rows) ? rows : Array.from(rows as Iterable<unknown>)).map((r: unknown) => {
    const row = r as Record<string, unknown>
    return {
      id:             row.id as string,
      order_id:       row.order_id as string | null,
      patient_id:     row.patient_id as string,
      status:         row.status as string,
      patient_notes:  row.patient_notes as string | null,
      submitted_at:   row.submitted_at as string,
      reviewed_at:    row.reviewed_at as string | null,
      ai_started_at:  row.ai_started_at as string | null,
      ai_completed_at:row.ai_completed_at as string | null,
      extracted_count:Number(row.extracted_count ?? 0),
      file_count:     Number(row.file_count ?? 0),
      patient: {
        first_name: row.patient__first_name as string | null,
        last_name:  row.patient__last_name as string | null,
        date_of_birth: row.patient__dob as string | null,
      },
    }
  })
}

// ─── Get one submission with files + extracted values ─────────────────────────

export async function getSubmission(tenantId: string, submissionId: string) {
  const submission = await db.query.labExternalSubmissions.findFirst({
    where: and(
      eq(labExternalSubmissions.tenant_id, tenantId),
      eq(labExternalSubmissions.id, submissionId),
    ),
    with: {
      patient: { columns: { id: true, first_name: true, last_name: true, date_of_birth: true } },
      reviewer: { columns: { id: true, first_name: true, last_name: true } },
      files: true,
      extracted_values: { orderBy: (t, { asc }) => [asc(t.sort_order), asc(t.created_at)] },
    },
  })
  if (!submission) throw new NotFoundError('LabExternalSubmission')

  // Generate signed URLs for each file
  const filesWithUrls = await Promise.all(
    submission.files.map(async (f) => ({
      ...f,
      url: await getSignedViewUrl(f.storage_key, 900),
    })),
  )

  return { ...submission, files: filesWithUrls }
}

// ─── AI extraction ────────────────────────────────────────────────────────────

export async function triggerAiExtraction(
  tenantId: string,
  submissionId: string,
  actorId: string,
  actorEmail: string,
) {
  const submission = await db.query.labExternalSubmissions.findFirst({
    where: and(
      eq(labExternalSubmissions.tenant_id, tenantId),
      eq(labExternalSubmissions.id, submissionId),
    ),
    with: { files: true },
  })
  if (!submission) throw new NotFoundError('LabExternalSubmission')
  if (submission.status === 'VALIDATED') {
    throw new ValidationError('Submission already validated')
  }

  // Mark as extracting
  await db.update(labExternalSubmissions)
    .set({ status: 'AI_EXTRACTING', ai_started_at: new Date(), updated_at: new Date() })
    .where(eq(labExternalSubmissions.id, submissionId))

  try {
    const extracted = await extractLabValuesFromFiles(submission.files)

    // Delete previous drafts and insert new ones
    await db.delete(labExtractedValues)
      .where(eq(labExtractedValues.submission_id, submissionId))

    if (extracted.length > 0) {
      await db.insert(labExtractedValues).values(
        extracted.map((v, i) => ({
          submission_id:  submissionId,
          tenant_id:      tenantId,
          panel_name:     v.panel_name,
          parameter_name: v.parameter_name,
          raw_value:      v.raw_value,
          numeric_value:  v.numeric_value != null ? String(v.numeric_value) : undefined,
          unit:           v.unit,
          ref_min:        v.ref_min != null ? String(v.ref_min) : undefined,
          ref_max:        v.ref_max != null ? String(v.ref_max) : undefined,
          ref_text:       v.ref_text,
          confidence:     String(v.confidence),
          raw_text:       v.raw_text,
          ai_flag:        v.ai_flag,
          status:         'AI_DRAFT' as const,
          sort_order:     i,
        })),
      )
    }

    await db.update(labExternalSubmissions)
      .set({ status: 'DRAFT_READY', ai_completed_at: new Date(), updated_at: new Date() })
      .where(eq(labExternalSubmissions.id, submissionId))

    await createAuditLog({
      tenant_id:     tenantId,
      actor_id:      actorId,
      actor_type:    'USER',
      actor_email:   actorEmail,
      action:        'LAB_EXTERNAL_AI_EXTRACTED',
      resource_type: 'LAB_ORDER',
      resource_id:   submissionId,
      context:       { extracted_count: extracted.length },
    })

  } catch (err) {
    await db.update(labExternalSubmissions)
      .set({ status: 'RECEIVED', ai_started_at: null, updated_at: new Date() })
      .where(eq(labExternalSubmissions.id, submissionId))
    throw err
  }

  return getSubmission(tenantId, submissionId)
}

// ─── AI: extract structured values from files ─────────────────────────────────

interface ExtractedValue {
  panel_name: string
  parameter_name: string
  raw_value: string | undefined
  numeric_value: number | undefined
  unit: string | undefined
  ref_min: number | undefined
  ref_max: number | undefined
  ref_text: string | undefined
  confidence: number
  raw_text: string | undefined
  ai_flag: 'H' | 'L' | 'N' | undefined
}

async function extractLabValuesFromFiles(
  files: Array<{ storage_key: string; mime_type: string; file_name: string }>,
): Promise<ExtractedValue[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new ValidationError('AI extraction not configured. Set ANTHROPIC_API_KEY.')
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const allValues: ExtractedValue[] = []

  for (const file of files) {
    let fileBuffer: Buffer
    try {
      fileBuffer = await readFileFromStorage(file.storage_key)
    } catch {
      continue
    }

    const base64Data = fileBuffer.toString('base64')
    const isPdf = file.mime_type === 'application/pdf'

    const mediaType = isPdf
      ? 'application/pdf'
      : file.mime_type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

    const contentBlock = isPdf
      ? {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: mediaType as 'application/pdf', data: base64Data },
        }
      : {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp', data: base64Data },
        }

    const systemPrompt = `Eres un asistente médico especializado en extraer resultados de laboratorio de documentos clínicos.
Tu tarea es identificar y extraer todos los parámetros de laboratorio del documento con precisión.

Responde ÚNICAMENTE con un JSON válido que sea un arreglo de objetos con esta estructura exacta:
[
  {
    "panel_name": "nombre del panel o grupo (ej: Hematología, Química sanguínea)",
    "parameter_name": "nombre del parámetro (ej: Glucosa en ayunas)",
    "raw_value": "valor exactamente como aparece en el documento",
    "numeric_value": número o null si no es numérico,
    "unit": "unidad de medida o null",
    "ref_min": número mínimo del rango de referencia o null,
    "ref_max": número máximo del rango de referencia o null,
    "ref_text": "referencia textual si no es numérica (ej: Negativo) o null",
    "ai_flag": "H" si alto, "L" si bajo, "N" si normal, null si no determinable,
    "confidence": número entre 0.0 y 1.0 indicando confianza en la extracción,
    "raw_text": "texto literal del documento para este parámetro"
  }
]

Reglas:
- Si un valor es ilegible o ambiguo: pon confidence < 0.7 y escribe el texto en raw_text
- Si falta la unidad: pon confidence máximo 0.8
- Valida rangos: hemoglobina no puede ser 2500, creatinina no puede ser negativa
- Agrupa los parámetros por su panel/grupo clínico si es posible
- Si el documento no contiene resultados de laboratorio, devuelve []`

    try {
      const response = await client.messages.create({
        model:      process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system:     systemPrompt,
        messages:   [
          {
            role: 'user',
            content: [
              contentBlock,
              { type: 'text', text: 'Extrae todos los resultados de laboratorio de este documento.' },
            ],
          },
        ],
      })

      const rawText = (response.content.find((b: { type: string }) => b.type === 'text') as { text?: string } | undefined)?.text ?? ''
      const jsonMatch = rawText.match(/\[[\s\S]*\]/)
      if (!jsonMatch) continue

      const parsed = JSON.parse(jsonMatch[0]) as unknown[]
      if (!Array.isArray(parsed)) continue

      for (const item of parsed) {
        if (typeof item !== 'object' || item === null) continue
        const v = item as Record<string, unknown>
        if (!v.parameter_name) continue

        allValues.push({
          panel_name:     String(v.panel_name ?? 'Sin grupo'),
          parameter_name: String(v.parameter_name),
          raw_value:      v.raw_value != null ? String(v.raw_value) : undefined,
          numeric_value:  typeof v.numeric_value === 'number' ? v.numeric_value : undefined,
          unit:           v.unit != null ? String(v.unit) : undefined,
          ref_min:        typeof v.ref_min === 'number' ? v.ref_min : undefined,
          ref_max:        typeof v.ref_max === 'number' ? v.ref_max : undefined,
          ref_text:       v.ref_text != null ? String(v.ref_text) : undefined,
          confidence:     typeof v.confidence === 'number' ? Math.min(1, Math.max(0, v.confidence)) : 0.5,
          raw_text:       v.raw_text != null ? String(v.raw_text) : undefined,
          ai_flag:        ['H', 'L', 'N'].includes(String(v.ai_flag)) ? v.ai_flag as 'H' | 'L' | 'N' : undefined,
        })
      }
    } catch {
      // Skip this file if AI call fails; continue with next
      continue
    }
  }

  return allValues
}

async function readFileFromStorage(storageKey: string): Promise<Buffer> {
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3')
  const { join } = await import('path')

  const isConfigured =
    !!process.env.STORAGE_ENDPOINT &&
    !!process.env.STORAGE_ACCESS_KEY &&
    !!process.env.STORAGE_SECRET_KEY

  if (isConfigured) {
    const s3 = new S3Client({
      endpoint: process.env.STORAGE_ENDPOINT,
      region:   process.env.STORAGE_REGION ?? 'auto',
      credentials: {
        accessKeyId:     process.env.STORAGE_ACCESS_KEY!,
        secretAccessKey: process.env.STORAGE_SECRET_KEY!,
      },
      forcePathStyle: !!process.env.STORAGE_FORCE_PATH_STYLE,
    })
    const resp = await s3.send(new GetObjectCommand({
      Bucket: process.env.STORAGE_BUCKET ?? 'meditrack-files',
      Key:    storageKey,
    }))
    const chunks: Buffer[] = []
    for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  } else {
    const { readFileSync } = await import('fs')
    const localPath = join(process.cwd(), 'uploads', storageKey)
    return readFileSync(localPath)
  }
}

// ─── Update extracted value (doctor accept/edit/reject) ───────────────────────

export async function updateExtractedValue(
  tenantId: string,
  submissionId: string,
  valueId: string,
  input: UpdateExtractedValueInput,
) {
  const value = await db.query.labExtractedValues.findFirst({
    where: and(
      eq(labExtractedValues.submission_id, submissionId),
      eq(labExtractedValues.id, valueId),
      eq(labExtractedValues.tenant_id, tenantId),
    ),
    columns: { id: true },
  })
  if (!value) throw new NotFoundError('ExtractedValue')

  await db.update(labExtractedValues)
    .set({
      status:       input.status,
      doctor_value: input.doctor_value,
      updated_at:   new Date(),
    })
    .where(eq(labExtractedValues.id, valueId))

  return getSubmission(tenantId, submissionId)
}

// ─── Validate and merge into lab_results ─────────────────────────────────────

export async function validateSubmission(
  tenantId: string,
  submissionId: string,
  actorId: string,
  actorEmail: string,
) {
  const submission = await db.query.labExternalSubmissions.findFirst({
    where: and(
      eq(labExternalSubmissions.tenant_id, tenantId),
      eq(labExternalSubmissions.id, submissionId),
    ),
    with: { extracted_values: true },
    columns: { id: true, order_id: true, status: true },
  })
  if (!submission) throw new NotFoundError('LabExternalSubmission')
  if (submission.status === 'VALIDATED') {
    throw new ValidationError('Already validated')
  }

  const accepted = submission.extracted_values.filter(
    v => v.status === 'ACCEPTED' || v.status === 'EDITED',
  )

  // If linked to an order, merge results into lab_results
  if (submission.order_id && accepted.length > 0) {
    await db.delete(labResults)
      .where(eq(labResults.order_id, submission.order_id))

    await db.insert(labResults).values(
      accepted.map((v, i) => ({
        order_id:       submission.order_id!,
        tenant_id:      tenantId,
        panel_name:     v.panel_name,
        parameter_name: v.parameter_name,
        value:          v.doctor_value ?? v.raw_value ?? undefined,
        numeric_value:  v.doctor_value != null
          ? (!isNaN(Number(v.doctor_value)) ? v.doctor_value : undefined)
          : (v.numeric_value != null ? v.numeric_value : undefined),
        unit:           v.unit,
        ref_min:        v.ref_min,
        ref_max:        v.ref_max,
        ref_text:       v.ref_text,
        status:         computeResultStatus(
          v.doctor_value ?? v.raw_value,
          v.ref_min != null ? Number(v.ref_min) : undefined,
          v.ref_max != null ? Number(v.ref_max) : undefined,
        ),
        sort_order:     i,
      })),
    )

    // Auto-complete the order if all results filled
    const allFilled = accepted.every(v => (v.doctor_value ?? v.raw_value) != null)
    if (allFilled) {
      await db.update(labOrders)
        .set({ status: 'COMPLETED', updated_at: new Date() })
        .where(eq(labOrders.id, submission.order_id))
    }
  }

  await db.update(labExternalSubmissions)
    .set({
      status:      'VALIDATED',
      reviewed_at: new Date(),
      reviewed_by: actorId,
      updated_at:  new Date(),
    })
    .where(eq(labExternalSubmissions.id, submissionId))

  await createAuditLog({
    tenant_id:     tenantId,
    actor_id:      actorId,
    actor_type:    'USER',
    actor_email:   actorEmail,
    action:        'LAB_EXTERNAL_VALIDATED',
    resource_type: 'LAB_ORDER',
    resource_id:   submissionId,
    context:       { order_id: submission.order_id, accepted_count: accepted.length },
  })

  return getSubmission(tenantId, submissionId)
}

function computeResultStatus(
  value: string | null | undefined,
  refMin: number | undefined,
  refMax: number | undefined,
): 'NORMAL' | 'HIGH' | 'LOW' | 'CRITICAL_HIGH' | 'CRITICAL_LOW' | 'PENDING' {
  if (value == null) return 'PENDING'
  const num = parseFloat(value)
  if (isNaN(num)) return 'PENDING'
  if (refMin != null && num < refMin) return num < refMin * 0.7 ? 'CRITICAL_LOW' : 'LOW'
  if (refMax != null && num > refMax) return num > refMax * 1.3 ? 'CRITICAL_HIGH' : 'HIGH'
  if (refMin != null || refMax != null) return 'NORMAL'
  return 'PENDING'
}

// ─── Portal: get submissions for patient ─────────────────────────────────────

export async function getPatientSubmissions(patientId: string, tenantId: string) {
  return db.query.labExternalSubmissions.findMany({
    where: and(
      eq(labExternalSubmissions.patient_id, patientId),
      eq(labExternalSubmissions.tenant_id, tenantId),
    ),
    with: { files: { columns: { id: true, file_name: true, mime_type: true, uploaded_at: true } } },
    columns: {
      id: true, order_id: true, status: true, patient_notes: true,
      submitted_at: true, reviewed_at: true, ai_completed_at: true,
    },
    orderBy: (t, { desc }) => [desc(t.submitted_at)],
  })
}
