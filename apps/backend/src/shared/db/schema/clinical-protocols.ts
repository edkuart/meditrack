import { relations } from 'drizzle-orm'
import { pgTable, uuid, varchar, text, boolean, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { tenants } from './tenants.ts'
import { encounterTypeEnum } from './encounters.ts'

export interface ClinicalProtocolMedication {
  drug_name: string
  presentation?: string
  concentration?: string
  dose_amount: number
  dose_unit: string
  route?: string
  frequency_type: 'DAILY' | 'EVERY_X_HOURS' | 'WEEKLY' | 'AS_NEEDED'
  frequency_value?: number
  times_per_day?: string[]
  duration_days?: number
  special_instructions?: string
  with_food?: boolean
  sort_order?: number
}

export const clinicalProtocols = pgTable('clinical_protocols', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  category: varchar('category', { length: 80 }).default('GENERAL').notNull(),
  description: text('description'),
  encounter_type: encounterTypeEnum('encounter_type'),
  note_template: text('note_template'),
  summary_template: text('summary_template'),
  treatment_name: varchar('treatment_name', { length: 200 }),
  treatment_instructions: text('treatment_instructions'),
  medications: jsonb('medications').$type<ClinicalProtocolMedication[]>().notNull(),
  follow_up_days: integer('follow_up_days'),
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('clinical_protocols_tenant_active_idx').on(table.tenant_id, table.is_active),
  index('clinical_protocols_tenant_category_idx').on(table.tenant_id, table.category),
])

export const clinicalProtocolsRelations = relations(clinicalProtocols, ({ one }) => ({
  tenant: one(tenants, { fields: [clinicalProtocols.tenant_id], references: [tenants.id] }),
}))

export type ClinicalProtocol = typeof clinicalProtocols.$inferSelect
export type NewClinicalProtocol = typeof clinicalProtocols.$inferInsert
