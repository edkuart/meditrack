import { and, eq } from 'drizzle-orm'
import { db, encounters } from '../../shared/db/index.ts'
import { createAuditLog } from '../../shared/services/audit.service.ts'
import { NotFoundError, ValidationError } from '../../shared/errors.ts'
import { buildAiAssistDraft } from './ai-assist.engine.ts'
import type { EncounterAiAssistInput } from './ai-assist.schema.ts'

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
      notes: true,
      summary: true,
    },
  })
  if (!encounter) throw new NotFoundError('Encounter')

  const sourceText = input.source_text?.trim() || [
    encounter.chief_complaint,
    encounter.notes,
    encounter.summary,
  ].filter(Boolean).join('\n')

  if (sourceText.trim().length < 12) {
    throw new ValidationError('Not enough clinical text to assist safely', { min_length: 12 })
  }

  const draft = buildAiAssistDraft(input.mode, sourceText)

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
