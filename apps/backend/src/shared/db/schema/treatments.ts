import { pgTable, uuid, text, varchar, boolean, integer, real, date, timestamp, jsonb, pgEnum, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'
import { users } from './users.ts'
import { encounters } from './encounters.ts'

export const interventionTypeEnum = pgEnum('intervention_type', [
  'EXERCISE',
  'DIET',
  'THERAPY',
  'MONITORING',
  'OTHER',
])

export const treatmentStatusEnum = pgEnum('treatment_status', [
  'DRAFT',
  'ACTIVE',
  'COMPLETED',
  'SUSPENDED',
  'CANCELLED',
])

export const frequencyTypeEnum = pgEnum('frequency_type', [
  'DAILY',
  'EVERY_X_HOURS',
  'WEEKLY',
  'AS_NEEDED',
])

export const doseStatusEnum = pgEnum('dose_status', [
  'PENDING',
  'CONFIRMED',
  'MISSED',
  'SKIPPED',
  'CANCELLED',
  'SUPERSEDED',
])

// ─── Treatment Plan ────────────────────────────────────────────────────────────

export const treatmentPlans = pgTable('treatment_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  encounter_id: uuid('encounter_id').references(() => encounters.id, { onDelete: 'restrict' }).notNull(),
  created_by: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  status: treatmentStatusEnum('status').default('DRAFT').notNull(),
  start_date: date('start_date').notNull(),
  end_date: date('end_date'),
  instructions: text('instructions'),
  activated_at: timestamp('activated_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('treatment_plans_patient_id_idx').on(table.patient_id),
  index('treatment_plans_tenant_id_idx').on(table.tenant_id),
  index('treatment_plans_tenant_patient_status_idx').on(table.tenant_id, table.patient_id, table.status),
  index('treatment_plans_tenant_encounter_idx').on(table.tenant_id, table.encounter_id),
])

// ─── Medication Item ───────────────────────────────────────────────────────────

export const medicationItems = pgTable('medication_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  treatment_plan_id: uuid('treatment_plan_id').references(() => treatmentPlans.id, { onDelete: 'cascade' }).notNull(),
  drug_name: varchar('drug_name', { length: 200 }).notNull(),
  presentation: varchar('presentation', { length: 100 }),
  concentration: varchar('concentration', { length: 50 }),
  dose_amount: real('dose_amount').notNull(),
  dose_unit: varchar('dose_unit', { length: 30 }).notNull(),
  route: varchar('route', { length: 50 }),
  frequency_type: frequencyTypeEnum('frequency_type').notNull(),
  frequency_value: integer('frequency_value'),
  times_per_day: jsonb('times_per_day'),
  duration_days: integer('duration_days'),
  special_instructions: text('special_instructions'),
  with_food: boolean('with_food').default(false).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  sort_order: integer('sort_order').default(0).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('medication_items_plan_active_idx').on(table.treatment_plan_id, table.is_active),
])

// ─── Dose Event ────────────────────────────────────────────────────────────────

export const doseEvents = pgTable('dose_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  medication_item_id: uuid('medication_item_id').references(() => medicationItems.id, { onDelete: 'cascade' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  scheduled_at: timestamp('scheduled_at', { withTimezone: true }).notNull(),
  status: doseStatusEnum('status').default('PENDING').notNull(),
  confirmed_at: timestamp('confirmed_at', { withTimezone: true }),
  confirmation_channel: varchar('confirmation_channel', { length: 30 }),
  notes: text('notes'),
  // Immutable after this timestamp (scheduled_at + 24 hours)
  can_edit_until: timestamp('can_edit_until', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('dose_events_patient_id_idx').on(table.patient_id),
  index('dose_events_scheduled_at_idx').on(table.patient_id, table.scheduled_at),
  index('dose_events_status_idx').on(table.status, table.scheduled_at),
  index('dose_events_patient_status_scheduled_idx').on(table.patient_id, table.status, table.scheduled_at),
  index('dose_events_medication_status_scheduled_idx').on(table.medication_item_id, table.status, table.scheduled_at),
])

// ─── Treatment Intervention ────────────────────────────────────────────────────

export const treatmentInterventions = pgTable('treatment_interventions', {
  id:                uuid('id').defaultRandom().primaryKey(),
  tenant_id:         uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  treatment_plan_id: uuid('treatment_plan_id').references(() => treatmentPlans.id, { onDelete: 'cascade' }).notNull(),
  patient_id:        uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  type:              interventionTypeEnum('type').default('OTHER').notNull(),
  title:             varchar('title', { length: 200 }).notNull(),
  description:       text('description'),
  frequency:         varchar('frequency', { length: 100 }),
  duration:          varchar('duration', { length: 50 }),
  instructions:      text('instructions'),
  sort_order:        integer('sort_order').default(0).notNull(),
  is_active:         boolean('is_active').default(true).notNull(),
  created_at:        timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at:        timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('treatment_interventions_plan_idx').on(t.treatment_plan_id, t.is_active),
  index('treatment_interventions_patient_idx').on(t.tenant_id, t.patient_id),
])

// ─── Relations ─────────────────────────────────────────────────────────────────

export const treatmentPlansRelations = relations(treatmentPlans, ({ one, many }) => ({
  tenant: one(tenants, { fields: [treatmentPlans.tenant_id], references: [tenants.id] }),
  patient: one(patients, { fields: [treatmentPlans.patient_id], references: [patients.id] }),
  encounter: one(encounters, { fields: [treatmentPlans.encounter_id], references: [encounters.id] }),
  created_by_user: one(users, { fields: [treatmentPlans.created_by], references: [users.id] }),
  medications:    many(medicationItems),
  interventions:  many(treatmentInterventions),
}))

export const medicationItemsRelations = relations(medicationItems, ({ one, many }) => ({
  treatment_plan: one(treatmentPlans, { fields: [medicationItems.treatment_plan_id], references: [treatmentPlans.id] }),
  dose_events: many(doseEvents),
}))

export const doseEventsRelations = relations(doseEvents, ({ one }) => ({
  medication_item: one(medicationItems, { fields: [doseEvents.medication_item_id], references: [medicationItems.id] }),
  patient: one(patients, { fields: [doseEvents.patient_id], references: [patients.id] }),
}))

export const treatmentInterventionsRelations = relations(treatmentInterventions, ({ one }) => ({
  treatment_plan: one(treatmentPlans, { fields: [treatmentInterventions.treatment_plan_id], references: [treatmentPlans.id] }),
  patient:        one(patients,       { fields: [treatmentInterventions.patient_id],        references: [patients.id] }),
  tenant:         one(tenants,        { fields: [treatmentInterventions.tenant_id],          references: [tenants.id] }),
}))

export type TreatmentPlan         = typeof treatmentPlans.$inferSelect
export type NewTreatmentPlan      = typeof treatmentPlans.$inferInsert
export type MedicationItem        = typeof medicationItems.$inferSelect
export type NewMedicationItem     = typeof medicationItems.$inferInsert
export type DoseEvent             = typeof doseEvents.$inferSelect
export type NewDoseEvent          = typeof doseEvents.$inferInsert
export type TreatmentIntervention    = typeof treatmentInterventions.$inferSelect
export type NewTreatmentIntervention = typeof treatmentInterventions.$inferInsert
