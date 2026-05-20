import {
  pgTable, uuid, text, varchar, timestamp, pgEnum,
  numeric, integer, jsonb, index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'
import { users } from './users.ts'
import { labOrders } from './lab.ts'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const labExternalStatusEnum = pgEnum('lab_external_status', [
  'RECEIVED',
  'AI_EXTRACTING',
  'DRAFT_READY',
  'VALIDATED',
  'REJECTED',
])

export const labExtractedValueStatusEnum = pgEnum('lab_extracted_value_status', [
  'AI_DRAFT',
  'ACCEPTED',
  'EDITED',
  'REJECTED',
])

// ─── lab_external_submissions ─────────────────────────────────────────────────

export const labExternalSubmissions = pgTable('lab_external_submissions', {
  id:           uuid('id').defaultRandom().primaryKey(),
  tenant_id:    uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  order_id:     uuid('order_id').references(() => labOrders.id, { onDelete: 'set null' }),
  patient_id:   uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  status:       labExternalStatusEnum('status').default('RECEIVED').notNull(),
  patient_notes:text('patient_notes'),
  submitted_at: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
  reviewed_at:  timestamp('reviewed_at', { withTimezone: true }),
  reviewed_by:  uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  ai_started_at:timestamp('ai_started_at', { withTimezone: true }),
  ai_completed_at:timestamp('ai_completed_at', { withTimezone: true }),
  created_at:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at:   timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('lab_ext_sub_tenant_idx').on(t.tenant_id),
  index('lab_ext_sub_patient_idx').on(t.tenant_id, t.patient_id),
  index('lab_ext_sub_order_idx').on(t.order_id),
  index('lab_ext_sub_status_idx').on(t.tenant_id, t.status),
])

export const labExternalSubmissionsRelations = relations(labExternalSubmissions, ({ one, many }) => ({
  tenant:   one(tenants,  { fields: [labExternalSubmissions.tenant_id],  references: [tenants.id] }),
  patient:  one(patients, { fields: [labExternalSubmissions.patient_id], references: [patients.id] }),
  order:    one(labOrders,{ fields: [labExternalSubmissions.order_id],   references: [labOrders.id] }),
  reviewer: one(users,    { fields: [labExternalSubmissions.reviewed_by],references: [users.id] }),
  files:    many(labSubmissionFiles),
  extracted_values: many(labExtractedValues),
}))

// ─── lab_submission_files ─────────────────────────────────────────────────────
// Separate from the doctor-managed documents table — patient-submitted files

export const labSubmissionFiles = pgTable('lab_submission_files', {
  id:            uuid('id').defaultRandom().primaryKey(),
  submission_id: uuid('submission_id').references(() => labExternalSubmissions.id, { onDelete: 'cascade' }).notNull(),
  tenant_id:     uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id:    uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  file_name:     varchar('file_name', { length: 255 }).notNull(),
  file_size:     integer('file_size').notNull(),
  mime_type:     varchar('mime_type', { length: 100 }).notNull(),
  storage_key:   text('storage_key').notNull(),
  uploaded_at:   timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('lab_sub_files_submission_idx').on(t.submission_id),
])

export const labSubmissionFilesRelations = relations(labSubmissionFiles, ({ one }) => ({
  submission: one(labExternalSubmissions, {
    fields: [labSubmissionFiles.submission_id],
    references: [labExternalSubmissions.id],
  }),
}))

// ─── lab_extracted_values ─────────────────────────────────────────────────────

export const labExtractedValues = pgTable('lab_extracted_values', {
  id:             uuid('id').defaultRandom().primaryKey(),
  submission_id:  uuid('submission_id').references(() => labExternalSubmissions.id, { onDelete: 'cascade' }).notNull(),
  tenant_id:      uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  panel_name:     varchar('panel_name', { length: 200 }).notNull(),
  parameter_name: varchar('parameter_name', { length: 200 }).notNull(),
  raw_value:      varchar('raw_value', { length: 100 }),
  numeric_value:  numeric('numeric_value', { precision: 12, scale: 4 }),
  unit:           varchar('unit', { length: 50 }),
  ref_min:        numeric('ref_min', { precision: 12, scale: 4 }),
  ref_max:        numeric('ref_max', { precision: 12, scale: 4 }),
  ref_text:       varchar('ref_text', { length: 100 }),
  // AI extraction metadata
  confidence:     numeric('confidence', { precision: 3, scale: 2 }).default('0').notNull(),
  raw_text:       varchar('raw_text', { length: 500 }),
  ai_flag:        varchar('ai_flag', { length: 10 }),  // 'H', 'L', 'N', null
  // Review state
  status:         labExtractedValueStatusEnum('status').default('AI_DRAFT').notNull(),
  doctor_value:   varchar('doctor_value', { length: 100 }),
  sort_order:     integer('sort_order').default(0).notNull(),
  created_at:     timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at:     timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('lab_extracted_submission_idx').on(t.submission_id),
])

export const labExtractedValuesRelations = relations(labExtractedValues, ({ one }) => ({
  submission: one(labExternalSubmissions, {
    fields: [labExtractedValues.submission_id],
    references: [labExternalSubmissions.id],
  }),
}))

export type LabExternalSubmission    = typeof labExternalSubmissions.$inferSelect
export type NewLabExternalSubmission = typeof labExternalSubmissions.$inferInsert
export type LabSubmissionFile        = typeof labSubmissionFiles.$inferSelect
export type LabExtractedValue        = typeof labExtractedValues.$inferSelect
