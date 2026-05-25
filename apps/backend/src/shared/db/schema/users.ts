import { pgTable, uuid, varchar, text, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'

export const userRoleEnum = pgEnum('user_role', [
  'SUPER_ADMIN',
  'ADMIN_CLINIC',
  'DOCTOR',
  'NURSE',
  'ASSISTANT',
  // Hospital-specific roles
  'LAB_TECHNICIAN',
  'RADIOLOGIST',
  'PHARMACIST',
  'RECEPTIONIST',
  'WARD_NURSE',
])

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  password_hash: text('password_hash').notNull(),
  role: userRoleEnum('role').default('DOCTOR').notNull(),
  custom_role_id: uuid('custom_role_id'),
  first_name: varchar('first_name', { length: 100 }).notNull(),
  last_name: varchar('last_name', { length: 100 }).notNull(),
  professional_id: varchar('professional_id', { length: 50 }),
  // Número de colegiado médico (Guatemala: Colegio de Médicos y Cirujanos)
  colegiado_number: varchar('colegiado_number', { length: 50 }),
  specialty: varchar('specialty', { length: 100 }),
  // Storage key of the uploaded DPI/ID document image (never expose URL directly)
  dpi_document_key: text('dpi_document_key'),
  is_verified: boolean('is_verified').default(false).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  // Populated when admin rejects a verification request
  verification_rejected_at: timestamp('verification_rejected_at', { withTimezone: true }),
  verification_rejected_reason: text('verification_rejected_reason'),
  two_fa_enabled: boolean('two_fa_enabled').default(false).notNull(),
  two_fa_secret_encrypted: text('two_fa_secret_encrypted'),
  two_fa_confirmed_at: timestamp('two_fa_confirmed_at', { withTimezone: true }),
  last_login_at: timestamp('last_login_at', { withTimezone: true }),
  // Legal acceptance tracking — gated at login if null or before policy update date
  tos_accepted_at: timestamp('tos_accepted_at', { withTimezone: true }),
  privacy_policy_accepted_at: timestamp('privacy_policy_accepted_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const usersRelations = relations(users, ({ one }) => ({
  tenant: one(tenants, { fields: [users.tenant_id], references: [tenants.id] }),
}))

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
