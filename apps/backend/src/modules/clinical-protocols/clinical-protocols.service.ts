import { and, eq, ilike, isNull, or } from 'drizzle-orm'
import {
  db,
  clinicalProtocols,
  type ClinicalProtocolMedication,
} from '../../shared/db/index.ts'
import {
  filterClinicalProtocols,
  SYSTEM_CLINICAL_PROTOCOLS,
  type ClinicalProtocolDto,
} from './clinical-protocols.catalog.ts'
import { NotFoundError, ForbiddenError } from '../../shared/errors.ts'
import type { ListClinicalProtocolsQuery, CreateProtocolInput, UpdateProtocolInput } from './clinical-protocols.schema.ts'

export async function listClinicalProtocols(
  tenantId: string,
  filters: ListClinicalProtocolsQuery = {},
): Promise<ClinicalProtocolDto[]> {
  const conditions = [
    eq(clinicalProtocols.is_active, true),
    or(isNull(clinicalProtocols.tenant_id), eq(clinicalProtocols.tenant_id, tenantId)),
  ]

  if (filters.category) {
    conditions.push(eq(clinicalProtocols.category, filters.category.toUpperCase()))
  }

  if (filters.q) {
    conditions.push(ilike(clinicalProtocols.name, `%${filters.q}%`))
  }

  const tenantRows = await db.query.clinicalProtocols.findMany({
    where: and(...conditions),
    orderBy: (protocols, { asc }) => [asc(protocols.category), asc(protocols.name)],
    limit: 100,
  })

  const dbProtocols: ClinicalProtocolDto[] = tenantRows.map((row) => ({
    id: row.id,
    source: row.tenant_id ? 'TENANT' : 'SYSTEM',
    name: row.name,
    category: row.category,
    description: row.description,
    encounter_type: row.encounter_type,
    note_template: row.note_template,
    summary_template: row.summary_template,
    treatment_name: row.treatment_name,
    treatment_instructions: row.treatment_instructions,
    medications: row.medications as ClinicalProtocolMedication[],
    follow_up_days: row.follow_up_days,
    tags: row.tags,
  }))

  const builtinProtocols = filterClinicalProtocols(SYSTEM_CLINICAL_PROTOCOLS, filters)
  const dbIds = new Set(dbProtocols.map((protocol) => protocol.id))

  return [
    ...dbProtocols,
    ...builtinProtocols.filter((protocol) => !dbIds.has(protocol.id)),
  ]
}

export async function createProtocol(tenantId: string, input: CreateProtocolInput): Promise<ClinicalProtocolDto> {
  const [row] = await db.insert(clinicalProtocols).values({
    tenant_id: tenantId,
    name: input.name,
    category: input.category,
    description: input.description,
    encounter_type: input.encounter_type,
    note_template: input.note_template,
    summary_template: input.summary_template,
    treatment_name: input.treatment_name,
    treatment_instructions: input.treatment_instructions,
    medications: input.medications as ClinicalProtocolMedication[],
    follow_up_days: input.follow_up_days,
    tags: input.tags,
  }).returning()

  return {
    id: row.id,
    source: 'TENANT',
    name: row.name,
    category: row.category,
    description: row.description ?? null,
    encounter_type: row.encounter_type ?? null,
    note_template: row.note_template ?? null,
    summary_template: row.summary_template ?? null,
    treatment_name: row.treatment_name ?? null,
    treatment_instructions: row.treatment_instructions ?? null,
    medications: (row.medications as ClinicalProtocolMedication[]) ?? [],
    follow_up_days: row.follow_up_days ?? null,
    tags: (row.tags as string[]) ?? [],
  }
}

export async function updateProtocol(
  tenantId: string,
  protocolId: string,
  input: UpdateProtocolInput,
): Promise<ClinicalProtocolDto> {
  const existing = await db.query.clinicalProtocols.findFirst({
    where: and(eq(clinicalProtocols.id, protocolId), eq(clinicalProtocols.tenant_id, tenantId)),
  })
  if (!existing) throw new NotFoundError('Protocol')

  const [row] = await db.update(clinicalProtocols)
    .set({ ...input, updated_at: new Date() })
    .where(eq(clinicalProtocols.id, protocolId))
    .returning()

  return {
    id: row.id,
    source: 'TENANT',
    name: row.name,
    category: row.category,
    description: row.description ?? null,
    encounter_type: row.encounter_type ?? null,
    note_template: row.note_template ?? null,
    summary_template: row.summary_template ?? null,
    treatment_name: row.treatment_name ?? null,
    treatment_instructions: row.treatment_instructions ?? null,
    medications: (row.medications as ClinicalProtocolMedication[]) ?? [],
    follow_up_days: row.follow_up_days ?? null,
    tags: (row.tags as string[]) ?? [],
  }
}

export async function deleteProtocol(tenantId: string, protocolId: string): Promise<void> {
  const existing = await db.query.clinicalProtocols.findFirst({
    where: and(eq(clinicalProtocols.id, protocolId), eq(clinicalProtocols.tenant_id, tenantId)),
    columns: { id: true, tenant_id: true },
  })
  if (!existing) throw new NotFoundError('Protocol')
  if (!existing.tenant_id) throw new ForbiddenError('Cannot delete a system protocol')

  await db.update(clinicalProtocols)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(clinicalProtocols.id, protocolId))
}
