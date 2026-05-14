import { and, eq } from 'drizzle-orm'
import { db, encounters } from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { NotFoundError, ValidationError } from '../../shared/errors.ts'
import { buildAiAssistDraft, buildClinicalCopilotDraft } from './ai-assist.engine.ts'
import { createReviewItem, getClinicalSummary } from '../clinical-intelligence/clinical-intelligence.service.ts'
import { aiFeatureFromAssistMode, recordAiUsage } from '../ai-usage/ai-usage.service.ts'
import type { ClinicalCopilotInput, EncounterAiAssistInput } from './ai-assist.schema.ts'

export async function assistEncounter(
  tenantId: string,
  actorId: string,
  actorEmail: string,
  encounterId: string,
  input: EncounterAiAssistInput,
) {
  const encounter = await db.query.encounters.findFirst({
    where: and(eq(encounters.tenant_id, tenantId), eq(encounters.id, encounterId)),
    columns: {
      id: true,
      patient_id: true,
      chief_complaint: true,
      subjective: true,
      objective: true,
      assessment: true,
      plan: true,
      notes: true,
      summary: true,
    },
  })
  if (!encounter) throw new NotFoundError('Encounter')

  const sourceText = input.source_text?.trim() || [
    encounter.chief_complaint,
    encounter.subjective,
    encounter.objective,
    encounter.assessment,
    encounter.plan,
    encounter.notes,
    encounter.summary,
  ].filter(Boolean).join('\n')

  if (sourceText.trim().length < 12) {
    throw new ValidationError('Not enough clinical text to assist safely', { min_length: 12 })
  }

  const draft = buildAiAssistDraft(input.mode, sourceText)

  await recordAiUsage(tenantId, actorId, actorEmail, {
    patient_id: encounter.patient_id,
    encounter_id: encounterId,
    feature: aiFeatureFromAssistMode(input.mode),
    provider: 'local',
    model: draft.model,
    units: 1,
    resource_type: 'ENCOUNTER',
    resource_id: encounterId,
    metadata: { mode: input.mode, source: input.source_text ? 'CLIENT_DRAFT' : 'ENCOUNTER_RECORD' },
  })

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'AI_ASSIST_USED',
    resource_type: 'ENCOUNTER',
    resource_id: encounterId,
    context: {
      patient_id: encounter.patient_id,
      mode: input.mode,
      model: draft.model,
      source: input.source_text ? 'CLIENT_DRAFT' : 'ENCOUNTER_RECORD',
    },
  })

  return draft
}

export async function runClinicalCopilot(
  tenantId: string,
  actorId: string,
  actorEmail: string,
  patientId: string,
  input: ClinicalCopilotInput,
) {
  let encounter: {
    id: string
    patient_id: string
    chief_complaint: string | null
    subjective: string | null
    objective: string | null
    assessment: string | null
    plan: string | null
    notes: string | null
    summary: string | null
  } | null = null

  if (input.encounter_id) {
    encounter = await db.query.encounters.findFirst({
      where: and(
        eq(encounters.tenant_id, tenantId),
        eq(encounters.patient_id, patientId),
        eq(encounters.id, input.encounter_id),
      ),
      columns: {
        id: true,
        patient_id: true,
        chief_complaint: true,
        subjective: true,
        objective: true,
        assessment: true,
        plan: true,
        notes: true,
        summary: true,
      },
    }) ?? null
    if (!encounter) throw new NotFoundError('Encounter')
  }

  const clinicalSummary = await getClinicalSummary(tenantId, patientId)
  const sourceText = input.source_text?.trim() || (encounter
    ? [
      encounter.chief_complaint,
      encounter.subjective,
      encounter.objective,
      encounter.assessment,
      encounter.plan,
      encounter.notes,
      encounter.summary,
    ].filter(Boolean).join('\n')
    : undefined)

  const draft = buildClinicalCopilotDraft(input.mode, clinicalSummary, sourceText)

  await recordAiUsage(tenantId, actorId, actorEmail, {
    patient_id: patientId,
    encounter_id: input.encounter_id,
    feature: aiFeatureFromAssistMode(input.mode),
    provider: 'local',
    model: draft.model,
    units: input.save_to_review_queue ? 2 : 1,
    resource_type: input.encounter_id ? 'ENCOUNTER' : 'PATIENT',
    resource_id: input.encounter_id ?? patientId,
    metadata: {
      mode: input.mode,
      saved_to_review_queue: input.save_to_review_queue,
      evidence_count: draft.evidence.length,
      soft_alert_count: draft.soft_alerts.length,
    },
  })

  let reviewItem: unknown = null
  if (input.save_to_review_queue) {
    reviewItem = await createReviewItem(
      tenantId,
      patientId,
      actorId,
      actorEmail,
      {
        encounter_id: input.encounter_id,
        item_type: input.mode === 'DRAFT_SOAP' ? 'ENCOUNTER_SOAP' : 'OTHER',
        priority: draft.soft_alerts.length ? 'HIGH' : 'NORMAL',
        title: input.mode === 'DRAFT_SOAP'
          ? 'Borrador SOAP generado por copiloto'
          : `Copiloto clínico: ${input.mode}`,
        summary: draft.summary,
        proposed_payload: { ...draft },
        normalized_payload: draft.soap_draft ? { ...draft.soap_draft } : {
          suggested_questions: draft.suggested_questions,
          clinical_gaps: draft.clinical_gaps,
          soft_alerts: draft.soft_alerts,
        },
        confidence: 0.5,
        reasoning: 'Generado por reglas locales a partir del resumen clínico estructurado; requiere validación médica.',
      },
    )
  }

  await createAuditLog({
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: 'USER',
    actor_email: actorEmail,
    action: 'AI_ASSIST_USED',
    resource_type: input.encounter_id ? 'ENCOUNTER' : 'PATIENT',
    resource_id: input.encounter_id ?? patientId,
    context: {
      patient_id: patientId,
      mode: input.mode,
      model: draft.model,
      saved_to_review_queue: input.save_to_review_queue,
    },
  })

  return {
    ...draft,
    review_item: reviewItem,
  }
}
