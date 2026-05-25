import { relations } from 'drizzle-orm'
import {
  boolean, date, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'

export const checkInSeverityEnum = pgEnum('check_in_severity', [
  'OK',
  'WATCH',
  'ALERT',
])

export const patientCheckIns = pgTable('patient_check_ins', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  check_in_date: date('check_in_date').notNull(),
  pain_score: integer('pain_score'),
  temperature_c: real('temperature_c'),
  symptoms: jsonb('symptoms').default([]).notNull(),
  side_effects: jsonb('side_effects').default([]).notNull(),
  red_flags: jsonb('red_flags').default([]).notNull(),
  medication_issue: boolean('medication_issue').default(false).notNull(),
  adherence_self_report: text('adherence_self_report'),
  adherence_skip_reason: text('adherence_skip_reason'),
  energy_level: text('energy_level'),
  sleep_quality: text('sleep_quality'),
  treatment_perception: text('treatment_perception'),
  mood: text('mood'),
  notes: text('notes'),
  severity: checkInSeverityEnum('severity').default('OK').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('patient_check_ins_patient_date_uidx').on(table.patient_id, table.check_in_date),
  index('patient_check_ins_tenant_patient_date_idx').on(table.tenant_id, table.patient_id, table.check_in_date),
  index('patient_check_ins_severity_idx').on(table.tenant_id, table.severity, table.created_at),
])

export const patientCheckInsRelations = relations(patientCheckIns, ({ one }) => ({
  tenant: one(tenants, { fields: [patientCheckIns.tenant_id], references: [tenants.id] }),
  patient: one(patients, { fields: [patientCheckIns.patient_id], references: [patients.id] }),
}))

export type PatientCheckIn = typeof patientCheckIns.$inferSelect
export type NewPatientCheckIn = typeof patientCheckIns.$inferInsert
