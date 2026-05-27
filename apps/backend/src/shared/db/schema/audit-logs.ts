import { pgTable, uuid, varchar, text, inet, jsonb, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'

export const auditActorTypeEnum = pgEnum('audit_actor_type', ['USER', 'PATIENT', 'SYSTEM'])

export const auditActionEnum = pgEnum('audit_action', [
  // Auth
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGOUT',
  'TOKEN_REFRESH',
  'PASSWORD_CHANGED',
  // Patient
  'PATIENT_CREATED',
  'PATIENT_UPDATED',
  'PATIENT_VIEWED',
  'PATIENT_SEARCHED',
  'PATIENT_ACCESSED',
  // Encounter
  'ENCOUNTER_OPENED',
  'ENCOUNTER_NOTES_SAVED',
  'ENCOUNTER_CLOSED',
  'ENCOUNTER_ARCHIVED',
  // Treatment
  'TREATMENT_CREATED',
  'TREATMENT_ACTIVATED',
  'TREATMENT_SUSPENDED',
  'TREATMENT_MODIFIED',
  // Dose
  'DOSE_CONFIRMED',
  'DOSE_MARKED_MISSED',
  'DOSE_SKIPPED',
  'DOSE_EDIT_WINDOW_EXPIRED',
  'CHECK_IN_SUBMITTED',
  // Documents
  'DOCUMENT_UPLOADED',
  'DOCUMENT_VIEWED',
  'DOCUMENT_DELETED',
  // Access tokens
  'TOKEN_GENERATED',
  'TOKEN_USED',
  'TOKEN_EXPIRED',
  'TOKEN_REVOKED',
  // Admin
  'USER_INVITED',
  'USER_VERIFIED',
  'USER_REJECTED',
  'USER_DEACTIVATED',
  'TENANT_UPDATED',
  'SETTINGS_CHANGED',
  'EXPORT_REQUESTED',
  // AI assist
  'AI_ASSIST_USED',
  // Clinical intelligence
  'CLINICAL_PROVENANCE_RECORDED',
  'CLINICAL_REVIEW_CREATED',
  'CLINICAL_REVIEW_APPROVED',
  'CLINICAL_REVIEW_REJECTED',
  'CLINICAL_REVIEW_SUPERSEDED',
  'DOCUMENT_PROCESSING_STARTED',
  'DOCUMENT_EXTRACTION_SUBMITTED',
  'CLINICAL_TRANSCRIPT_CREATED',
  'CLINICAL_TRANSCRIPT_REVIEWED',
  'AI_USAGE_RECORDED',
  // Billing
  'BILLING_CHECKOUT_STARTED',
  'BILLING_PLAN_CHANGED',
  'BILLING_INVOICE_PAID_MANUAL',
  'BILLING_INVOICE_CANCELLED',
  // Compliance
  'CONSENT_RECORDED',
  'CONSENT_WITHDRAWN',
  'PATIENT_ANONYMIZED',
  'DATA_EXPORT_REQUESTED',
  'TOS_ACCEPTED',
  'PRIVACY_POLICY_ACCEPTED',
  // Lab
  'LAB_ORDER_CREATED',
  'LAB_ORDER_UPDATED',
  'LAB_RESULTS_ENTERED',
  // Retention
  'DATA_RETENTION_PURGE',
  // Patient department access (Phase 3)
  'PATIENT_ACCESS_GRANTED',
  'PATIENT_ACCESS_REVOKED',
  // Referrals (Phase 4)
  'REFERRAL_CREATED',
  'REFERRAL_ACCEPTED',
  'REFERRAL_REJECTED',
  'REFERRAL_COMPLETED',
  'REFERRAL_CANCELLED',
  // Admissions (Phase 5)
  'PATIENT_ADMITTED',
  'PATIENT_DISCHARGED',
  // Lab external submissions
  'LAB_EXTERNAL_SUBMITTED',
  'LAB_EXTERNAL_AI_EXTRACTED',
  'LAB_EXTERNAL_VALIDATED',
])

// This table is APPEND-ONLY — no UPDATE or DELETE should ever run on it.
// Enforced by: database trigger + application layer + restricted DB role.
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull(),
  actor_id: uuid('actor_id').notNull(),
  actor_type: auditActorTypeEnum('actor_type').notNull(),
  actor_email: varchar('actor_email', { length: 254 }),
  action: auditActionEnum('action').notNull(),
  resource_type: varchar('resource_type', { length: 50 }).notNull(),
  resource_id: uuid('resource_id'),
  ip_address: text('ip_address'),
  user_agent: text('user_agent'),
  // { before: {}, after: {} } for UPDATE actions
  changes: jsonb('changes'),
  // { request_id, session_id, patient_id }
  context: jsonb('context').default({}).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('audit_logs_tenant_id_idx').on(table.tenant_id, table.created_at),
  index('audit_logs_actor_id_idx').on(table.actor_id),
  index('audit_logs_resource_idx').on(table.resource_type, table.resource_id),
  index('audit_logs_action_idx').on(table.action, table.created_at),
])

export type AuditLog = typeof auditLogs.$inferSelect
export type NewAuditLog = typeof auditLogs.$inferInsert
