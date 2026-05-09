import { pgTable, uuid, varchar, text, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'
import { users } from './users.ts'

export const consentTypeEnum = pgEnum('consent_type', [
  'data_processing',
  'treatment',
  'third_party_sharing',
  'research',
  'marketing',
])

export const patientConsents = pgTable('patient_consents', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'cascade' }).notNull(),
  consent_type: consentTypeEnum('consent_type').notNull(),
  // Free-text detail of what was consented to (e.g. specific procedure or policy version)
  description: text('description'),
  // Who recorded this consent (staff member, not the patient themselves)
  recorded_by: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
  recorded_by_email: varchar('recorded_by_email', { length: 254 }),
  // When the patient actually gave consent (may differ from recorded_at)
  consented_at: timestamp('consented_at', { withTimezone: true }).notNull(),
  // Withdrawal — null means consent is still active
  withdrawn_at: timestamp('withdrawn_at', { withTimezone: true }),
  withdrawn_by: uuid('withdrawn_by').references(() => users.id, { onDelete: 'set null' }),
  ip_address: text('ip_address'),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('patient_consents_patient_id_idx').on(table.patient_id),
  index('patient_consents_tenant_id_idx').on(table.tenant_id, table.created_at),
])

export const patientConsentsRelations = relations(patientConsents, ({ one }) => ({
  tenant: one(tenants, { fields: [patientConsents.tenant_id], references: [tenants.id] }),
  patient: one(patients, { fields: [patientConsents.patient_id], references: [patients.id] }),
  recorder: one(users, { fields: [patientConsents.recorded_by], references: [users.id] }),
}))

export type PatientConsent = typeof patientConsents.$inferSelect
export type NewPatientConsent = typeof patientConsents.$inferInsert
