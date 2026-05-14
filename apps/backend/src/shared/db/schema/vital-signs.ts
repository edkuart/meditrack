import { pgTable, uuid, integer, numeric, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'
import { encounters } from './encounters.ts'
import { users } from './users.ts'

export const vitalSigns = pgTable('vital_signs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  encounter_id: uuid('encounter_id').references(() => encounters.id, { onDelete: 'restrict' }).notNull(),
  // Presión arterial (mmHg)
  blood_pressure_systolic: integer('blood_pressure_systolic'),
  blood_pressure_diastolic: integer('blood_pressure_diastolic'),
  // Frecuencia cardíaca (lpm)
  heart_rate: integer('heart_rate'),
  // Frecuencia respiratoria (rpm)
  respiratory_rate: integer('respiratory_rate'),
  // Temperatura (°C) — numeric para decimales (ej. 36.5)
  temperature_celsius: numeric('temperature_celsius', { precision: 4, scale: 1 }),
  // Peso (kg) y talla (cm)
  weight_kg: numeric('weight_kg', { precision: 5, scale: 2 }),
  height_cm: numeric('height_cm', { precision: 5, scale: 1 }),
  // Saturación de oxígeno (%)
  oxygen_saturation: integer('oxygen_saturation'),
  // Glucemia (mg/dL) — opcional
  glucose_mg_dl: integer('glucose_mg_dl'),
  recorded_by: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
  recorded_at: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('vital_signs_encounter_id_idx').on(table.encounter_id),
  index('vital_signs_patient_id_idx').on(table.tenant_id, table.patient_id),
])

export const vitalSignsRelations = relations(vitalSigns, ({ one }) => ({
  tenant: one(tenants, { fields: [vitalSigns.tenant_id], references: [tenants.id] }),
  patient: one(patients, { fields: [vitalSigns.patient_id], references: [patients.id] }),
  encounter: one(encounters, { fields: [vitalSigns.encounter_id], references: [encounters.id] }),
  recorded_by_user: one(users, { fields: [vitalSigns.recorded_by], references: [users.id] }),
}))

export type VitalSigns = typeof vitalSigns.$inferSelect
export type NewVitalSigns = typeof vitalSigns.$inferInsert
