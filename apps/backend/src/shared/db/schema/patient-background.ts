import { pgTable, uuid, text, boolean, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'
import { users } from './users.ts'

// Categorías de antecedentes según formato latinoamericano de historia clínica
export const backgroundCategoryEnum = pgEnum('background_category', [
  'AHF',         // Antecedentes Heredofamiliares
  'APP',         // Antecedentes Patológicos Personales (enfermedades previas)
  'APNP',        // Antecedentes Patológicos No Patológicos (hábitos, estilo de vida)
  'AQ',          // Antecedentes Quirúrgicos
  'ATRAUMA',     // Antecedentes Traumáticos
  'ALERGIAS',    // Alergias (medicamentos, alimentos, ambientales)
  'GINECO_OBS',  // Gineco-Obstétricos (FUM, gestas, partos, abortos, etc.)
  'MEDICAMENTOS',// Medicamentos actuales / previos relevantes
  'PERINATAL',   // Antecedentes Perinatales (para pediatría)
])

export const patientBackground = pgTable('patient_background', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  category: backgroundCategoryEnum('category').notNull(),
  content: text('content').notNull(),
  // Cuando se actualiza, el registro anterior se marca is_current=false
  // y se crea uno nuevo, manteniendo historial de cambios
  is_current: boolean('is_current').default(true).notNull(),
  recorded_by: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
  recorded_at: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  retired_by: uuid('retired_by').references(() => users.id, { onDelete: 'set null' }),
  retired_at: timestamp('retired_at', { withTimezone: true }),
  retired_reason: text('retired_reason'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('patient_background_patient_id_idx').on(table.tenant_id, table.patient_id),
  index('patient_background_current_idx').on(table.patient_id, table.category, table.is_current),
])

export const patientBackgroundRelations = relations(patientBackground, ({ one }) => ({
  tenant: one(tenants, { fields: [patientBackground.tenant_id], references: [tenants.id] }),
  patient: one(patients, { fields: [patientBackground.patient_id], references: [patients.id] }),
  recorded_by_user: one(users, { fields: [patientBackground.recorded_by], references: [users.id] }),
  retired_by_user: one(users, { fields: [patientBackground.retired_by], references: [users.id] }),
}))

export type PatientBackground = typeof patientBackground.$inferSelect
export type NewPatientBackground = typeof patientBackground.$inferInsert
