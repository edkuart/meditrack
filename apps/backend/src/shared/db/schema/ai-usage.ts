import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'
import { encounters } from './encounters.ts'
import { users } from './users.ts'

export const aiUsageFeatureEnum = pgEnum('ai_usage_feature', [
  'ENCOUNTER_SUMMARY',
  'PATIENT_SIMPLIFICATION',
  'CLINICAL_COPILOT',
  'DOCUMENT_EXTRACTION',
  'TRANSCRIPTION',
  'OTHER',
])

export const aiUsageEvents = pgTable('ai_usage_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  actor_id: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'set null' }),
  encounter_id: uuid('encounter_id').references(() => encounters.id, { onDelete: 'set null' }),
  feature: aiUsageFeatureEnum('feature').notNull(),
  provider: varchar('provider', { length: 80 }).default('local').notNull(),
  model: varchar('model', { length: 120 }).notNull(),
  units: integer('units').default(1).notNull(),
  input_tokens: integer('input_tokens'),
  output_tokens: integer('output_tokens'),
  estimated_cost_cents: integer('estimated_cost_cents').default(0).notNull(),
  resource_type: varchar('resource_type', { length: 50 }),
  resource_id: uuid('resource_id'),
  metadata: jsonb('metadata').default({}).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('ai_usage_tenant_created_idx').on(table.tenant_id, table.created_at),
  index('ai_usage_actor_created_idx').on(table.actor_id, table.created_at),
  index('ai_usage_patient_created_idx').on(table.patient_id, table.created_at),
  index('ai_usage_feature_created_idx').on(table.feature, table.created_at),
])

export const aiUsageEventsRelations = relations(aiUsageEvents, ({ one }) => ({
  tenant: one(tenants, { fields: [aiUsageEvents.tenant_id], references: [tenants.id] }),
  actor: one(users, { fields: [aiUsageEvents.actor_id], references: [users.id] }),
  patient: one(patients, { fields: [aiUsageEvents.patient_id], references: [patients.id] }),
  encounter: one(encounters, { fields: [aiUsageEvents.encounter_id], references: [encounters.id] }),
}))

export type AiUsageEvent = typeof aiUsageEvents.$inferSelect
export type NewAiUsageEvent = typeof aiUsageEvents.$inferInsert
