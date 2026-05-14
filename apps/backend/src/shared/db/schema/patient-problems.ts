import { pgTable, uuid, varchar, text, date, integer, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'
import { encounters } from './encounters.ts'
import { users } from './users.ts'

export const problemStatusEnum = pgEnum('problem_status', [
  'ACTIVE',
  'INACTIVE',
  'RESOLVED',
  'CHRONIC',
])

export const patientProblems = pgTable('patient_problems', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  // Número correlativo del problema (lista de Weed)
  problem_number: integer('problem_number').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  // Código CIE-10 (ej. "E11.9" — Diabetes mellitus tipo 2 sin complicaciones)
  icd10_code: varchar('icd10_code', { length: 10 }),
  icd10_description: varchar('icd10_description', { length: 255 }),
  status: problemStatusEnum('status').default('ACTIVE').notNull(),
  onset_date: date('onset_date'),
  resolved_date: date('resolved_date'),
  notes: text('notes'),
  // Encuentro donde se identificó por primera vez
  identified_in_encounter_id: uuid('identified_in_encounter_id').references(() => encounters.id, { onDelete: 'set null' }),
  created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('patient_problems_patient_id_idx').on(table.tenant_id, table.patient_id),
  index('patient_problems_status_idx').on(table.patient_id, table.status),
])

export const patientProblemsRelations = relations(patientProblems, ({ one }) => ({
  tenant: one(tenants, { fields: [patientProblems.tenant_id], references: [tenants.id] }),
  patient: one(patients, { fields: [patientProblems.patient_id], references: [patients.id] }),
  identified_in_encounter: one(encounters, {
    fields: [patientProblems.identified_in_encounter_id],
    references: [encounters.id],
  }),
  created_by_user: one(users, { fields: [patientProblems.created_by], references: [users.id] }),
}))

export type PatientProblem = typeof patientProblems.$inferSelect
export type NewPatientProblem = typeof patientProblems.$inferInsert
