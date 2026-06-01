import { pgTable, uuid, varchar, text, boolean, integer, bigint, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'
import { users } from './users.ts'
import { encounters } from './encounters.ts'

export const documentTypeEnum = pgEnum('document_type', [
  'PRESCRIPTION',
  'LAB_RESULT',
  'IMAGING',
  'CONSENT',
  'CLINICAL_NOTE',
  'OTHER',
])

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  encounter_id: uuid('encounter_id').references(() => encounters.id, { onDelete: 'set null' }),
  uploaded_by: uuid('uploaded_by').references(() => users.id, { onDelete: 'restrict' }),
  type: documentTypeEnum('type').default('OTHER').notNull(),
  file_name: varchar('file_name', { length: 255 }).notNull(),
  // Size in bytes
  file_size: bigint('file_size', { mode: 'number' }).notNull(),
  mime_type: varchar('mime_type', { length: 100 }).notNull(),
  // Internal storage path — never expose directly
  storage_key: text('storage_key').notNull(),
  // SHA-256 checksum for integrity verification
  checksum: varchar('checksum', { length: 64 }).notNull(),
  is_visible_to_patient: boolean('is_visible_to_patient').default(false).notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('documents_patient_id_idx').on(table.patient_id),
  index('documents_tenant_id_idx').on(table.tenant_id),
  index('documents_encounter_id_idx').on(table.encounter_id),
])

export const documentsRelations = relations(documents, ({ one }) => ({
  tenant: one(tenants, { fields: [documents.tenant_id], references: [tenants.id] }),
  patient: one(patients, { fields: [documents.patient_id], references: [patients.id] }),
  encounter: one(encounters, { fields: [documents.encounter_id], references: [encounters.id] }),
  uploaded_by_user: one(users, { fields: [documents.uploaded_by], references: [users.id] }),
}))

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
