import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'
import { encounters } from './encounters.ts'
import { documents } from './documents.ts'
import { users } from './users.ts'

export const clinicalSourceTypeEnum = pgEnum('clinical_source_type', [
  'MANUAL_ENTRY',
  'DOCUMENT_UPLOAD',
  'LAB_RESULT',
  'VITAL_SIGN',
  'ENCOUNTER_NOTE',
  'PATIENT_PORTAL',
  'AI_EXTRACTION',
  'EXTERNAL_RECORD',
  'AUDIO_TRANSCRIPT',
])

export const clinicalReviewItemTypeEnum = pgEnum('clinical_review_item_type', [
  'PATIENT_PROBLEM',
  'PATIENT_BACKGROUND',
  'VITAL_SIGNS',
  'LAB_RESULT',
  'ENCOUNTER_SOAP',
  'MEDICATION',
  'DOCUMENT_SUMMARY',
  'OTHER',
])

export const clinicalReviewStatusEnum = pgEnum('clinical_review_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED',
])

export const clinicalReviewPriorityEnum = pgEnum('clinical_review_priority', [
  'LOW',
  'NORMAL',
  'HIGH',
])

export const documentProcessingStatusEnum = pgEnum('document_processing_status', [
  'QUEUED',
  'PROCESSING',
  'NEEDS_EXTRACTION',
  'NEEDS_REVIEW',
  'COMPLETED',
  'FAILED',
])

export const documentProcessingModeEnum = pgEnum('document_processing_mode', [
  'LOCAL_TRIAGE',
  'EXTERNAL_AI',
  'MANUAL_EXTRACTION',
])

export const clinicalTranscriptStatusEnum = pgEnum('clinical_transcript_status', [
  'DRAFT',
  'TRANSCRIBED',
  'NEEDS_REVIEW',
  'REVIEWED',
  'ARCHIVED',
])

export const clinicalDataProvenance = pgTable('clinical_data_provenance', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  encounter_id: uuid('encounter_id').references(() => encounters.id, { onDelete: 'set null' }),
  document_id: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  source_type: clinicalSourceTypeEnum('source_type').notNull(),
  source_resource_type: varchar('source_resource_type', { length: 50 }),
  source_resource_id: uuid('source_resource_id'),
  source_label: varchar('source_label', { length: 255 }),
  source_excerpt: text('source_excerpt'),
  source_checksum: varchar('source_checksum', { length: 64 }),
  target_resource_type: varchar('target_resource_type', { length: 50 }),
  target_resource_id: uuid('target_resource_id'),
  target_field: varchar('target_field', { length: 100 }),
  extraction_method: varchar('extraction_method', { length: 80 }),
  confidence: real('confidence'),
  metadata: jsonb('metadata').default({}).notNull(),
  recorded_by: uuid('recorded_by').references(() => users.id, { onDelete: 'set null' }),
  reviewed_by: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('clinical_provenance_patient_idx').on(table.tenant_id, table.patient_id, table.created_at),
  index('clinical_provenance_target_idx').on(table.target_resource_type, table.target_resource_id),
  index('clinical_provenance_document_idx').on(table.document_id),
])

export const clinicalReviewItems = pgTable('clinical_review_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  encounter_id: uuid('encounter_id').references(() => encounters.id, { onDelete: 'set null' }),
  document_id: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  provenance_id: uuid('provenance_id').references(() => clinicalDataProvenance.id, { onDelete: 'set null' }),
  item_type: clinicalReviewItemTypeEnum('item_type').notNull(),
  status: clinicalReviewStatusEnum('status').default('PENDING').notNull(),
  priority: clinicalReviewPriorityEnum('priority').default('NORMAL').notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  summary: text('summary'),
  proposed_payload: jsonb('proposed_payload').default({}).notNull(),
  normalized_payload: jsonb('normalized_payload').default({}).notNull(),
  confidence: real('confidence'),
  reasoning: text('reasoning'),
  reviewer_notes: text('reviewer_notes'),
  created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  reviewed_by: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('clinical_review_patient_status_idx').on(table.tenant_id, table.patient_id, table.status, table.created_at),
  index('clinical_review_document_idx').on(table.document_id),
  index('clinical_review_provenance_idx').on(table.provenance_id),
])

export const clinicalDocumentProcessingJobs = pgTable('clinical_document_processing_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  document_id: uuid('document_id').references(() => documents.id, { onDelete: 'cascade' }).notNull(),
  encounter_id: uuid('encounter_id').references(() => encounters.id, { onDelete: 'set null' }),
  mode: documentProcessingModeEnum('mode').default('LOCAL_TRIAGE').notNull(),
  status: documentProcessingStatusEnum('status').default('QUEUED').notNull(),
  processor: varchar('processor', { length: 100 }).default('meditrack-local-triage-v1').notNull(),
  extracted_text: text('extracted_text'),
  extracted_payload: jsonb('extracted_payload').default({}).notNull(),
  finding_count: integer('finding_count').default(0).notNull(),
  error_message: text('error_message'),
  requested_by: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
  started_at: timestamp('started_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('clinical_document_jobs_document_idx').on(table.document_id, table.created_at),
  index('clinical_document_jobs_patient_status_idx').on(table.tenant_id, table.patient_id, table.status, table.created_at),
])

export const clinicalAudioTranscripts = pgTable('clinical_audio_transcripts', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  encounter_id: uuid('encounter_id').references(() => encounters.id, { onDelete: 'set null' }),
  document_id: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  status: clinicalTranscriptStatusEnum('status').default('TRANSCRIBED').notNull(),
  source_label: varchar('source_label', { length: 255 }),
  language: varchar('language', { length: 20 }).default('es').notNull(),
  processor: varchar('processor', { length: 100 }).default('manual-transcript-v1').notNull(),
  transcript_text: text('transcript_text').notNull(),
  segments: jsonb('segments').default([]).notNull(),
  summary: text('summary'),
  duration_seconds: integer('duration_seconds'),
  confidence: real('confidence'),
  created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  reviewed_by: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('clinical_audio_transcripts_patient_idx').on(table.tenant_id, table.patient_id, table.created_at),
  index('clinical_audio_transcripts_encounter_idx').on(table.encounter_id, table.created_at),
])

export const clinicalDataProvenanceRelations = relations(clinicalDataProvenance, ({ one, many }) => ({
  tenant: one(tenants, { fields: [clinicalDataProvenance.tenant_id], references: [tenants.id] }),
  patient: one(patients, { fields: [clinicalDataProvenance.patient_id], references: [patients.id] }),
  encounter: one(encounters, { fields: [clinicalDataProvenance.encounter_id], references: [encounters.id] }),
  document: one(documents, { fields: [clinicalDataProvenance.document_id], references: [documents.id] }),
  recorder: one(users, { fields: [clinicalDataProvenance.recorded_by], references: [users.id] }),
  reviewer: one(users, { fields: [clinicalDataProvenance.reviewed_by], references: [users.id] }),
  review_items: many(clinicalReviewItems),
}))

export const clinicalReviewItemsRelations = relations(clinicalReviewItems, ({ one }) => ({
  tenant: one(tenants, { fields: [clinicalReviewItems.tenant_id], references: [tenants.id] }),
  patient: one(patients, { fields: [clinicalReviewItems.patient_id], references: [patients.id] }),
  encounter: one(encounters, { fields: [clinicalReviewItems.encounter_id], references: [encounters.id] }),
  document: one(documents, { fields: [clinicalReviewItems.document_id], references: [documents.id] }),
  provenance: one(clinicalDataProvenance, {
    fields: [clinicalReviewItems.provenance_id],
    references: [clinicalDataProvenance.id],
  }),
  creator: one(users, { fields: [clinicalReviewItems.created_by], references: [users.id] }),
  reviewer: one(users, { fields: [clinicalReviewItems.reviewed_by], references: [users.id] }),
}))

export const clinicalDocumentProcessingJobsRelations = relations(clinicalDocumentProcessingJobs, ({ one }) => ({
  tenant: one(tenants, { fields: [clinicalDocumentProcessingJobs.tenant_id], references: [tenants.id] }),
  patient: one(patients, { fields: [clinicalDocumentProcessingJobs.patient_id], references: [patients.id] }),
  document: one(documents, { fields: [clinicalDocumentProcessingJobs.document_id], references: [documents.id] }),
  encounter: one(encounters, { fields: [clinicalDocumentProcessingJobs.encounter_id], references: [encounters.id] }),
  requester: one(users, { fields: [clinicalDocumentProcessingJobs.requested_by], references: [users.id] }),
}))

export const clinicalAudioTranscriptsRelations = relations(clinicalAudioTranscripts, ({ one }) => ({
  tenant: one(tenants, { fields: [clinicalAudioTranscripts.tenant_id], references: [tenants.id] }),
  patient: one(patients, { fields: [clinicalAudioTranscripts.patient_id], references: [patients.id] }),
  encounter: one(encounters, { fields: [clinicalAudioTranscripts.encounter_id], references: [encounters.id] }),
  document: one(documents, { fields: [clinicalAudioTranscripts.document_id], references: [documents.id] }),
  creator: one(users, { fields: [clinicalAudioTranscripts.created_by], references: [users.id] }),
  reviewer: one(users, { fields: [clinicalAudioTranscripts.reviewed_by], references: [users.id] }),
}))

export type ClinicalDataProvenance = typeof clinicalDataProvenance.$inferSelect
export type NewClinicalDataProvenance = typeof clinicalDataProvenance.$inferInsert
export type ClinicalReviewItem = typeof clinicalReviewItems.$inferSelect
export type NewClinicalReviewItem = typeof clinicalReviewItems.$inferInsert
export type ClinicalDocumentProcessingJob = typeof clinicalDocumentProcessingJobs.$inferSelect
export type NewClinicalDocumentProcessingJob = typeof clinicalDocumentProcessingJobs.$inferInsert
export type ClinicalAudioTranscript = typeof clinicalAudioTranscripts.$inferSelect
export type NewClinicalAudioTranscript = typeof clinicalAudioTranscripts.$inferInsert
