import { pgTable, uuid, text, varchar, timestamp, pgEnum, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'
import { users } from './users.ts'

export const encounterTypeEnum = pgEnum('encounter_type', [
  'CONSULTATION',
  'FOLLOW_UP',
  'POST_HOSPITALIZATION',
  'DISCHARGE',
  'CHRONIC_CONTROL',
  'EMERGENCY',
])

export const encounterStatusEnum = pgEnum('encounter_status', [
  'DRAFT',
  'OPEN',
  'CLOSED',
  'ARCHIVED',
])

export const encounters = pgTable('encounters', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  doctor_id: uuid('doctor_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  encounter_type: encounterTypeEnum('encounter_type').default('CONSULTATION').notNull(),
  status: encounterStatusEnum('status').default('OPEN').notNull(),
  chief_complaint: varchar('chief_complaint', { length: 500 }),
  notes: text('notes'),
  summary: text('summary'),
  metadata: jsonb('metadata').default({}).notNull(),
  opened_at: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
  closed_at: timestamp('closed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('encounters_tenant_id_idx').on(table.tenant_id),
  index('encounters_patient_id_idx').on(table.patient_id),
  index('encounters_doctor_id_idx').on(table.doctor_id),
  index('encounters_opened_at_idx').on(table.tenant_id, table.opened_at),
])

export const encountersRelations = relations(encounters, ({ one }) => ({
  tenant: one(tenants, { fields: [encounters.tenant_id], references: [tenants.id] }),
  patient: one(patients, { fields: [encounters.patient_id], references: [patients.id] }),
  doctor: one(users, { fields: [encounters.doctor_id], references: [users.id] }),
}))

export type Encounter = typeof encounters.$inferSelect
export type NewEncounter = typeof encounters.$inferInsert
