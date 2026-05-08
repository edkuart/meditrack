import { pgTable, uuid, text, varchar, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { patients } from './patients.ts'
import { users } from './users.ts'

export const accessChannelEnum = pgEnum('access_channel', [
  'magic_link',
  'qr',
  'pin',
  'whatsapp',
])

export const patientAccessTokens = pgTable('patient_access_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'cascade' }).notNull(),
  token_hash: text('token_hash').notNull().unique(),
  channel: accessChannelEnum('channel').notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  used_at: timestamp('used_at', { withTimezone: true }),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
  created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('pat_patient_id_idx').on(table.patient_id),
  index('pat_token_hash_idx').on(table.token_hash),
])

export const patientAccessTokensRelations = relations(patientAccessTokens, ({ one }) => ({
  patient: one(patients, { fields: [patientAccessTokens.patient_id], references: [patients.id] }),
  created_by_user: one(users, { fields: [patientAccessTokens.created_by], references: [users.id] }),
}))

export type PatientAccessToken = typeof patientAccessTokens.$inferSelect
export type NewPatientAccessToken = typeof patientAccessTokens.$inferInsert
