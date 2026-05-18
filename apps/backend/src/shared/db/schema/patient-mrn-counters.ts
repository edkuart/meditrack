import { pgTable, uuid, smallint, integer, primaryKey } from 'drizzle-orm/pg-core'
import { tenants } from './tenants.ts'

export const patientMrnCounters = pgTable('patient_mrn_counters', {
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  year: smallint('year').notNull(),
  last_seq: integer('last_seq').default(0).notNull(),
}, (t) => [
  primaryKey({ columns: [t.tenant_id, t.year] }),
])

export type PatientMrnCounter = typeof patientMrnCounters.$inferSelect
