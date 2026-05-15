import { and, asc, desc, eq } from 'drizzle-orm'
import {
  clinicalAudioTranscripts,
  clinicalDataProvenance,
  clinicalDocumentProcessingJobs,
  clinicalReviewItems,
  db,
  documents,
  encounters,
  labOrders,
  patientBackground,
  patientProblems,
  patients,
  treatmentPlans,
  vitalSigns,
} from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.ts'
import type {
  CreateProvenanceInput,
  CreateClinicalTranscriptInput,
  CreateReviewItemInput,
  ListReviewItemsInput,
  ResolveReviewItemInput,
  ReviewClinicalTranscriptInput,
  StartDocumentProcessingInput,
  SubmitDocumentExtractionInput,
} from './clinical-intelligence.schema.ts'

async function assertPatient(tenantId: string, patientId: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: { id: true },
  })
  if (!patient) throw new NotFoundError('Patient')
}

async function assertEncounter(tenantId: string, patientId: string, encounterId?: string) {
  if (!encounterId) return
  const encounter = await db.query.encounters.findFirst({
    where: and(
      eq(encounters.tenant_id, tenantId),
      eq(encounters.patient_id, patientId),
      eq(encounters.id, encounterId),
    ),
    columns: { id: true },
  })
  if (!encounter) throw new NotFoundError('Encounter')
}

async function assertDocument(tenantId: string, patientId: string, documentId?: string) {
  if (!documentId) return
  const document = await db.query.documents.findFirst({
    where: and(
      eq(documents.tenant_id, tenantId),
      eq(documents.patient_id, patientId),
      eq(documents.id, documentId),
    ),
    columns: { id: true },
  })
  if (!document) throw new NotFoundError('Document')
}

async function getDocumentForTenant(tenantId: string, documentId: string) {
  const document = await db.query.documents.findFirst({
    where: and(eq(documents.tenant_id, tenantId), eq(documents.id, documentId)),
    columns: {
      id: true,
      tenant_id: true,
      patient_id: true,
      encounter_id: true,
      type: true,
      file_name: true,
      file_size: true,
      mime_type: true,
      checksum: true,
      created_at: true,
    },
  })
  if (!document) throw new NotFoundError('Document')
  return document
}

function recommendedExtractionFor(mimeType: string) {
  if (mimeType === 'application/pdf') {
    return {
      input_kind: 'PDF',
      recommended_processor: 'PDF_TEXT_OR_VISION',
      next_step: 'Extract text and page references, then submit findings for clinical review.',
    }
  }
  if (mimeType.startsWith('image/')) {
    return {
      input_kind: 'IMAGE',
      recommended_processor: 'VISION_OCR',
      next_step: 'Run OCR/vision extraction, then submit findings for clinical review.',
    }
  }
  return {
    input_kind: 'UNKNOWN',
    recommended_processor: 'MANUAL_REVIEW',
    next_step: 'Review document manually and submit structured findings.',
  }
}

function summarizeTranscript(text: string) {
  const normalized = text
    .replace(/\s+/g, ' ')
    .trim()
  if (normalized.length <= 280) return normalized
  return `${normalized.slice(0, 277).trim()}...`
}

export async function listProvenance(tenantId: string, patientId: string) {
  await assertPatient(tenantId, patientId)

  return db.query.clinicalDataProvenance.findMany({
    where: and(
      eq(clinicalDataProvenance.tenant_id, tenantId),
      eq(clinicalDataProvenance.patient_id, patientId),
    ),
    orderBy: (p, { desc }) => desc(p.created_at),
    with: {
      document: { columns: { id: true, file_name: true, type: true, mime_type: true, created_at: true } },
      encounter: { columns: { id: true, encounter_type: true, opened_at: true } },
      recorder: { columns: { id: true, first_name: true, last_name: true } },
      reviewer: { columns: { id: true, first_name: true, last_name: true } },
    },
  })
}

export async function getClinicalSummary(tenantId: string, patientId: string) {
  const patient = await db.query.patients.findFirst({
    where: and(eq(patients.tenant_id, tenantId), eq(patients.id, patientId)),
    columns: {
      id: true,
      first_name: true,
      last_name: true,
      date_of_birth: true,
      sex: true,
      phone: true,
      email: true,
      id_number: true,
      emergency_contact: true,
      tags: true,
      notes: true,
      created_at: true,
      updated_at: true,
    },
  })
  if (!patient) throw new NotFoundError('Patient')

  const [
    problems,
    background,
    latestEncounters,
    latestVitals,
    latestLabs,
    latestDocuments,
    latestTranscripts,
    treatments,
    pendingReview,
  ] = await Promise.all([
    db.query.patientProblems.findMany({
      where: and(eq(patientProblems.tenant_id, tenantId), eq(patientProblems.patient_id, patientId)),
      orderBy: asc(patientProblems.problem_number),
    }),
    db.query.patientBackground.findMany({
      where: and(
        eq(patientBackground.tenant_id, tenantId),
        eq(patientBackground.patient_id, patientId),
        eq(patientBackground.is_current, true),
      ),
      orderBy: asc(patientBackground.category),
    }),
    db.query.encounters.findMany({
      where: and(eq(encounters.tenant_id, tenantId), eq(encounters.patient_id, patientId)),
      columns: {
        id: true,
        encounter_type: true,
        status: true,
        chief_complaint: true,
        subjective: true,
        objective: true,
        assessment: true,
        plan: true,
        summary: true,
        opened_at: true,
        closed_at: true,
      },
      orderBy: desc(encounters.opened_at),
      limit: 10,
    }),
    db.query.vitalSigns.findMany({
      where: and(eq(vitalSigns.tenant_id, tenantId), eq(vitalSigns.patient_id, patientId)),
      orderBy: desc(vitalSigns.recorded_at),
      limit: 10,
    }),
    db.query.labOrders.findMany({
      where: and(eq(labOrders.tenant_id, tenantId), eq(labOrders.patient_id, patientId)),
      with: { results: { orderBy: (r, { asc }) => asc(r.sort_order) } },
      orderBy: desc(labOrders.ordered_at),
      limit: 10,
    }),
    db.query.documents.findMany({
      where: and(eq(documents.tenant_id, tenantId), eq(documents.patient_id, patientId)),
      columns: {
        id: true,
        encounter_id: true,
        type: true,
        file_name: true,
        file_size: true,
        mime_type: true,
        checksum: true,
        is_visible_to_patient: true,
        created_at: true,
      },
      orderBy: desc(documents.created_at),
      limit: 20,
    }),
    db.query.clinicalAudioTranscripts.findMany({
      where: and(eq(clinicalAudioTranscripts.tenant_id, tenantId), eq(clinicalAudioTranscripts.patient_id, patientId)),
      columns: {
        id: true,
        encounter_id: true,
        document_id: true,
        status: true,
        source_label: true,
        language: true,
        processor: true,
        summary: true,
        duration_seconds: true,
        confidence: true,
        created_at: true,
      },
      orderBy: desc(clinicalAudioTranscripts.created_at),
      limit: 5,
    }),
    db.query.treatmentPlans.findMany({
      where: and(eq(treatmentPlans.tenant_id, tenantId), eq(treatmentPlans.patient_id, patientId)),
      with: {
        medications: { orderBy: (m, { asc }) => asc(m.sort_order) },
        interventions: { orderBy: (i, { asc }) => asc(i.sort_order) },
      },
      orderBy: desc(treatmentPlans.created_at),
      limit: 10,
    }),
    db.query.clinicalReviewItems.findMany({
      where: and(
        eq(clinicalReviewItems.tenant_id, tenantId),
        eq(clinicalReviewItems.patient_id, patientId),
        eq(clinicalReviewItems.status, 'PENDING'),
      ),
      orderBy: desc(clinicalReviewItems.created_at),
      limit: 20,
    }),
  ])

  return {
    patient,
    problems,
    background,
    latest_encounters: latestEncounters,
    latest_vitals: latestVitals,
    latest_labs: latestLabs,
    latest_documents: latestDocuments,
    latest_transcripts: latestTranscripts,
    treatments,
    pending_review_items: pendingReview,
  }
}

export async function listClinicalTranscripts(tenantId: string, patientId: string) {
  await assertPatient(tenantId, patientId)

  return db.query.clinicalAudioTranscripts.findMany({
    where: and(eq(clinicalAudioTranscripts.tenant_id, tenantId), eq(clinicalAudioTranscripts.patient_id, patientId)),
    orderBy: (t, { desc }) => desc(t.created_at),
    with: {
      encounter: { columns: { id: true, encounter_type: true, opened_at: true } },
      document: { columns: { id: true, file_name: true, type: true, mime_type: true } },
      creator: { columns: { id: true, first_name: true, last_name: true } },
      reviewer: { columns: { id: true, first_name: true, last_name: true } },
    },
  })
}

export async function createClinicalTranscript(
  tenantId: string,
  patientId: string,
  actorId: string,
  actorEmail: string,
  input: CreateClinicalTranscriptInput,
) {
  await assertPatient(tenantId, patientId)
  await assertEncounter(tenantId, patientId, input.encounter_id)
  await assertDocument(tenantId, patientId, input.document_id)

  const summary = input.summary?.trim() || summarizeTranscript(input.transcript_text)
  const [transcript] = await db.insert(clinicalAudioTranscripts).values({
    tenant_id: tenantId,
    patient_id: patientId,
    encounter_id: input.encounter_id,
    document_id: input.document_id,
    status: input.create_review_item ? 'NEEDS_REVIEW' : 'TRANSCRIBED',
    source_label: input.source_label,
    language: input.language,
    processor: input.processor,
    transcript_text: input.transcript_text,
    segments: input.segments,
    summary,
    duration_seconds: input.duration_seconds,
    confidence: input.confidence,
    created_by: actorId,
  }).returning()

  const provenance = await recordProvenance(tenantId, patientId, actorId, actorEmail, {
    encounter_id: input.encounter_id,
    document_id: input.document_id,
    source_type: 'AUDIO_TRANSCRIPT',
    source_resource_type: 'CLINICAL_AUDIO_TRANSCRIPT',
    source_resource_id: transcript.id,
    source_label: input.source_label ?? 'Transcripción clínica',
    source_excerpt: input.transcript_text.slice(0, 4000),
    target_resource_type: 'CLINICAL_AUDIO_TRANSCRIPT',
    target_resource_id: transcript.id,
    extraction_method: input.processor,
    confidence: input.confidence,
    metadata: {
      language: input.language,
      duration_seconds: input.duration_seconds,
      segment_count: input.segments.length,
    },
  })

  let reviewItem = null
  if (input.create_review_item) {
    reviewItem = await createReviewItem(tenantId, patientId, actorId, actorEmail, {
      encounter_id: input.encounter_id,
      provenance_id: provenance.id,
      item_type: input.encounter_id ? 'ENCOUNTER_SOAP' : 'OTHER',
      priority: 'NORMAL',
      title: input.encounter_id
        ? 'Transcripción de consulta pendiente de convertir/revisar en SOAP'
        : 'Transcripción clínica pendiente de revisión',
      summary,
      proposed_payload: {
        transcript_id: transcript.id,
        transcript_text: input.transcript_text,
        segments: input.segments,
      },
      normalized_payload: {
        transcript_id: transcript.id,
        summary,
      },
      confidence: input.confidence,
      reasoning: 'Transcripción clínica ingresada como fuente; debe revisarse antes de incorporarse a la historia.',
    })
  }

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'CLINICAL_TRANSCRIPT_CREATED',
    resource_type: 'CLINICAL_AUDIO_TRANSCRIPT',
    resource_id: transcript.id,
    context: {
      patient_id: patientId,
      encounter_id: input.encounter_id,
      provenance_id: provenance.id,
      review_item_id: reviewItem?.id,
      processor: input.processor,
    },
  })

  return { transcript, provenance, review_item: reviewItem }
}

export async function reviewClinicalTranscript(
  tenantId: string,
  transcriptId: string,
  actorId: string,
  actorEmail: string,
  input: ReviewClinicalTranscriptInput,
) {
  const existing = await db.query.clinicalAudioTranscripts.findFirst({
    where: and(eq(clinicalAudioTranscripts.tenant_id, tenantId), eq(clinicalAudioTranscripts.id, transcriptId)),
  })
  if (!existing) throw new NotFoundError('Clinical audio transcript')

  const now = new Date()
  const [updated] = await db.update(clinicalAudioTranscripts).set({
    status: input.status,
    reviewed_by: actorId,
    reviewed_at: now,
    updated_at: now,
  }).where(and(
    eq(clinicalAudioTranscripts.tenant_id, tenantId),
    eq(clinicalAudioTranscripts.id, transcriptId),
  )).returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'CLINICAL_TRANSCRIPT_REVIEWED',
    resource_type: 'CLINICAL_AUDIO_TRANSCRIPT',
    resource_id: transcriptId,
    context: {
      patient_id: existing.patient_id,
      encounter_id: existing.encounter_id,
      status: input.status,
      reviewer_notes: input.reviewer_notes,
    },
  })

  return updated
}

export async function listDocumentProcessingJobs(tenantId: string, documentId: string) {
  const document = await getDocumentForTenant(tenantId, documentId)

  return db.query.clinicalDocumentProcessingJobs.findMany({
    where: and(
      eq(clinicalDocumentProcessingJobs.tenant_id, tenantId),
      eq(clinicalDocumentProcessingJobs.document_id, document.id),
    ),
    orderBy: (jobs, { desc }) => desc(jobs.created_at),
    with: {
      requester: { columns: { id: true, first_name: true, last_name: true } },
    },
  })
}

export async function startDocumentProcessing(
  tenantId: string,
  documentId: string,
  actorId: string,
  actorEmail: string,
  input: StartDocumentProcessingInput,
) {
  const document = await getDocumentForTenant(tenantId, documentId)
  const now = new Date()
  const triage = recommendedExtractionFor(document.mime_type)
  const processor = input.processor ?? (
    input.mode === 'LOCAL_TRIAGE'
      ? 'meditrack-local-triage-v1'
      : input.mode === 'EXTERNAL_AI'
        ? 'external-ai-pending'
        : 'manual-extraction-v1'
  )

  const [job] = await db.insert(clinicalDocumentProcessingJobs).values({
    tenant_id: tenantId,
    patient_id: document.patient_id,
    document_id: document.id,
    encounter_id: document.encounter_id,
    mode: input.mode,
    status: input.mode === 'LOCAL_TRIAGE' ? 'NEEDS_EXTRACTION' : 'QUEUED',
    processor,
    extracted_payload: {
      document: {
        id: document.id,
        file_name: document.file_name,
        type: document.type,
        mime_type: document.mime_type,
        file_size: document.file_size,
        checksum: document.checksum,
      },
      triage,
    },
    requested_by: actorId,
    started_at: now,
    completed_at: input.mode === 'LOCAL_TRIAGE' ? now : undefined,
  }).returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'DOCUMENT_PROCESSING_STARTED',
    resource_type: 'DOCUMENT',
    resource_id: document.id,
    context: {
      patient_id: document.patient_id,
      job_id: job.id,
      mode: input.mode,
      processor,
      status: job.status,
    },
  })

  return job
}

export async function submitDocumentExtraction(
  tenantId: string,
  documentId: string,
  actorId: string,
  actorEmail: string,
  input: SubmitDocumentExtractionInput,
) {
  const document = await getDocumentForTenant(tenantId, documentId)
  const now = new Date()
  const existingJob = input.job_id
    ? await db.query.clinicalDocumentProcessingJobs.findFirst({
      where: and(
        eq(clinicalDocumentProcessingJobs.tenant_id, tenantId),
        eq(clinicalDocumentProcessingJobs.document_id, document.id),
        eq(clinicalDocumentProcessingJobs.id, input.job_id),
      ),
    })
    : null

  if (input.job_id && !existingJob) throw new NotFoundError('Document processing job')

  const job = existingJob ?? (await db.insert(clinicalDocumentProcessingJobs).values({
    tenant_id: tenantId,
    patient_id: document.patient_id,
    document_id: document.id,
    encounter_id: document.encounter_id,
    mode: input.processor.toLowerCase().startsWith('manual') ? 'MANUAL_EXTRACTION' : 'EXTERNAL_AI',
    status: 'PROCESSING',
    processor: input.processor,
    requested_by: actorId,
    started_at: now,
  }).returning())[0]

  const sourceType = input.processor.toLowerCase().startsWith('manual') ? 'MANUAL_ENTRY' : 'AI_EXTRACTION'
  const provenance = await recordProvenance(tenantId, document.patient_id, actorId, actorEmail, {
    encounter_id: document.encounter_id ?? undefined,
    document_id: document.id,
    source_type: sourceType,
    source_resource_type: 'DOCUMENT',
    source_resource_id: document.id,
    source_label: document.file_name,
    source_excerpt: input.extracted_text?.slice(0, 4000),
    source_checksum: document.checksum,
    target_resource_type: 'CLINICAL_REVIEW_ITEM',
    extraction_method: input.processor,
    confidence: input.findings.length
      ? Math.max(...input.findings.map(finding => finding.confidence ?? 0))
      : undefined,
    metadata: {
      job_id: job.id,
      document_type: document.type,
      mime_type: document.mime_type,
      extracted_payload: input.extracted_payload,
    },
  })

  const reviewItems = []
  for (const finding of input.findings) {
    reviewItems.push(await createReviewItem(
      tenantId,
      document.patient_id,
      actorId,
      actorEmail,
      {
        encounter_id: document.encounter_id ?? undefined,
        document_id: document.id,
        provenance_id: provenance.id,
        item_type: finding.item_type,
        priority: finding.priority,
        title: finding.title,
        summary: finding.summary,
        proposed_payload: finding.proposed_payload,
        normalized_payload: {
          ...finding.normalized_payload,
          source_excerpt: finding.source_excerpt,
        },
        confidence: finding.confidence,
        reasoning: finding.reasoning,
      },
    ))
  }

  const [updatedJob] = await db.update(clinicalDocumentProcessingJobs).set({
    status: reviewItems.length > 0 ? 'NEEDS_REVIEW' : 'COMPLETED',
    processor: input.processor,
    extracted_text: input.extracted_text,
    extracted_payload: input.extracted_payload,
    finding_count: reviewItems.length,
    completed_at: now,
    updated_at: now,
  }).where(and(
    eq(clinicalDocumentProcessingJobs.tenant_id, tenantId),
    eq(clinicalDocumentProcessingJobs.id, job.id),
  )).returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'DOCUMENT_EXTRACTION_SUBMITTED',
    resource_type: 'DOCUMENT',
    resource_id: document.id,
    context: {
      patient_id: document.patient_id,
      job_id: job.id,
      provenance_id: provenance.id,
      finding_count: reviewItems.length,
      processor: input.processor,
    },
  })

  return {
    job: updatedJob,
    provenance,
    review_items: reviewItems,
  }
}

export async function recordProvenance(
  tenantId: string,
  patientId: string,
  actorId: string,
  actorEmail: string,
  input: CreateProvenanceInput,
) {
  await assertPatient(tenantId, patientId)
  await assertEncounter(tenantId, patientId, input.encounter_id)
  await assertDocument(tenantId, patientId, input.document_id)

  const [row] = await db.insert(clinicalDataProvenance).values({
    tenant_id: tenantId,
    patient_id: patientId,
    encounter_id: input.encounter_id,
    document_id: input.document_id,
    source_type: input.source_type,
    source_resource_type: input.source_resource_type,
    source_resource_id: input.source_resource_id,
    source_label: input.source_label,
    source_excerpt: input.source_excerpt,
    source_checksum: input.source_checksum,
    target_resource_type: input.target_resource_type,
    target_resource_id: input.target_resource_id,
    target_field: input.target_field,
    extraction_method: input.extraction_method,
    confidence: input.confidence,
    metadata: input.metadata,
    recorded_by: actorId,
  }).returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'CLINICAL_PROVENANCE_RECORDED',
    resource_type: 'CLINICAL_PROVENANCE',
    resource_id: row.id,
    context: {
      patient_id: patientId,
      encounter_id: input.encounter_id,
      document_id: input.document_id,
      source_type: input.source_type,
      target_resource_type: input.target_resource_type,
    },
  })

  return row
}

export async function listReviewItems(
  tenantId: string,
  patientId: string,
  input: ListReviewItemsInput,
) {
  await assertPatient(tenantId, patientId)

  return db.query.clinicalReviewItems.findMany({
    where: input.status
      ? and(
        eq(clinicalReviewItems.tenant_id, tenantId),
        eq(clinicalReviewItems.patient_id, patientId),
        eq(clinicalReviewItems.status, input.status),
      )
      : and(eq(clinicalReviewItems.tenant_id, tenantId), eq(clinicalReviewItems.patient_id, patientId)),
    orderBy: [desc(clinicalReviewItems.created_at)],
    limit: input.limit,
    with: {
      document: { columns: { id: true, file_name: true, type: true, mime_type: true, created_at: true } },
      encounter: { columns: { id: true, encounter_type: true, opened_at: true } },
      provenance: {
        columns: {
          id: true,
          source_type: true,
          source_label: true,
          source_excerpt: true,
          confidence: true,
          created_at: true,
        },
      },
      creator: { columns: { id: true, first_name: true, last_name: true } },
      reviewer: { columns: { id: true, first_name: true, last_name: true } },
    },
  })
}

export async function listTenantReviewItems(
  tenantId: string,
  input: ListReviewItemsInput,
) {
  return db.query.clinicalReviewItems.findMany({
    where: input.status
      ? and(eq(clinicalReviewItems.tenant_id, tenantId), eq(clinicalReviewItems.status, input.status))
      : eq(clinicalReviewItems.tenant_id, tenantId),
    orderBy: [desc(clinicalReviewItems.created_at)],
    limit: input.limit,
    with: {
      patient: { columns: { id: true, first_name: true, last_name: true, date_of_birth: true, sex: true } },
      document: { columns: { id: true, file_name: true, type: true, mime_type: true, created_at: true } },
      encounter: { columns: { id: true, encounter_type: true, opened_at: true } },
      provenance: {
        columns: {
          id: true,
          source_type: true,
          source_label: true,
          source_excerpt: true,
          confidence: true,
          created_at: true,
        },
      },
      creator: { columns: { id: true, first_name: true, last_name: true } },
      reviewer: { columns: { id: true, first_name: true, last_name: true } },
    },
  })
}

export async function createReviewItem(
  tenantId: string,
  patientId: string,
  actorId: string,
  actorEmail: string,
  input: CreateReviewItemInput,
) {
  await assertPatient(tenantId, patientId)
  await assertEncounter(tenantId, patientId, input.encounter_id)
  await assertDocument(tenantId, patientId, input.document_id)

  if (input.provenance_id) {
    const provenance = await db.query.clinicalDataProvenance.findFirst({
      where: and(
        eq(clinicalDataProvenance.tenant_id, tenantId),
        eq(clinicalDataProvenance.patient_id, patientId),
        eq(clinicalDataProvenance.id, input.provenance_id),
      ),
      columns: { id: true },
    })
    if (!provenance) throw new NotFoundError('Clinical provenance')
  }

  if (input.confidence != null && input.confidence >= 0.9 && !input.reasoning) {
    throw new ValidationError('High-confidence review items must include reasoning')
  }

  const [row] = await db.insert(clinicalReviewItems).values({
    tenant_id: tenantId,
    patient_id: patientId,
    encounter_id: input.encounter_id,
    document_id: input.document_id,
    provenance_id: input.provenance_id,
    item_type: input.item_type,
    priority: input.priority,
    title: input.title,
    summary: input.summary,
    proposed_payload: input.proposed_payload,
    normalized_payload: input.normalized_payload,
    confidence: input.confidence,
    reasoning: input.reasoning,
    created_by: actorId,
  }).returning()

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'CLINICAL_REVIEW_CREATED',
    resource_type: 'CLINICAL_REVIEW_ITEM',
    resource_id: row.id,
    context: {
      patient_id: patientId,
      item_type: input.item_type,
      priority: input.priority,
      provenance_id: input.provenance_id,
    },
  })

  return row
}

export async function resolveReviewItem(
  tenantId: string,
  itemId: string,
  actorId: string,
  actorEmail: string,
  input: ResolveReviewItemInput,
) {
  const existing = await db.query.clinicalReviewItems.findFirst({
    where: and(eq(clinicalReviewItems.tenant_id, tenantId), eq(clinicalReviewItems.id, itemId)),
  })
  if (!existing) throw new NotFoundError('Clinical review item')
  if (existing.status !== 'PENDING') {
    throw new ForbiddenError('Only pending clinical review items can be resolved')
  }

  const now = new Date()
  const [updated] = await db.update(clinicalReviewItems).set({
    status: input.status,
    reviewer_notes: input.reviewer_notes,
    reviewed_by: actorId,
    reviewed_at: now,
    updated_at: now,
  }).where(and(eq(clinicalReviewItems.tenant_id, tenantId), eq(clinicalReviewItems.id, itemId))).returning()

  if (existing.provenance_id && input.status === 'APPROVED') {
    await db.update(clinicalDataProvenance).set({
      reviewed_by: actorId,
      reviewed_at: now,
    }).where(and(
      eq(clinicalDataProvenance.tenant_id, tenantId),
      eq(clinicalDataProvenance.id, existing.provenance_id),
    ))
  }

  const action = input.status === 'APPROVED'
    ? 'CLINICAL_REVIEW_APPROVED'
    : input.status === 'REJECTED'
      ? 'CLINICAL_REVIEW_REJECTED'
      : 'CLINICAL_REVIEW_SUPERSEDED'

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action,
    resource_type: 'CLINICAL_REVIEW_ITEM',
    resource_id: itemId,
    context: {
      patient_id: existing.patient_id,
      item_type: existing.item_type,
      provenance_id: existing.provenance_id,
    },
  })

  return updated
}
