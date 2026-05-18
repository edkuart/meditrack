import { pgTable, uuid, varchar, text, boolean, timestamp, date, jsonb, pgEnum, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { users } from './users.ts'

export const sexEnum = pgEnum('sex', ['male', 'female', 'other'])

export const patients = pgTable('patients', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  first_name: varchar('first_name', { length: 100 }).notNull(),
  last_name: varchar('last_name', { length: 100 }).notNull(),
  date_of_birth: date('date_of_birth'),
  sex: sexEnum('sex'),
  // Stored encrypted at rest in production
  phone: varchar('phone', { length: 30 }),
  email: varchar('email', { length: 254 }),
  id_number: varchar('id_number', { length: 30 }),
  access_pin_hash: text('access_pin_hash'),
  emergency_contact: jsonb('emergency_contact'),
  tags: jsonb('tags').default([]).notNull(),
  notes: text('notes'),
  is_active: boolean('is_active').default(true).notNull(),
  // Set when GDPR erasure is applied — PII columns become null/redacted, medical data stays
  mrn: varchar('mrn', { length: 20 }).unique(),
  anonymized_at: timestamp('anonymized_at', { withTimezone: true }),
  created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('patients_tenant_id_idx').on(table.tenant_id),
  index('patients_id_number_idx').on(table.tenant_id, table.id_number),
  index('patients_name_idx').on(table.tenant_id, table.last_name, table.first_name),
  index('patients_tenant_active_created_idx').on(table.tenant_id, table.is_active, table.created_at),
  index('patients_mrn_idx').on(table.mrn),
])

export const patientsRelations = relations(patients, ({ one }) => ({
  tenant: one(tenants, { fields: [patients.tenant_id], references: [tenants.id] }),
  created_by_user: one(users, { fields: [patients.created_by], references: [users.id] }),
}))

export type Patient = typeof patients.$inferSelect
export type NewPatient = typeof patients.$inferInsert
