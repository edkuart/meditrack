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
import type { ListClinicalProtocolsQuery } from './clinical-protocols.schema.ts'

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
