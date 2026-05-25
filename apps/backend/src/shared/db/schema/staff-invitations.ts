import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { users } from './users.ts'
import { userRoleEnum } from './users.ts'
import { departments } from './departments.ts'

export const staffInvitations = pgTable('staff_invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  email: varchar('email', { length: 254 }).notNull(),
  role: userRoleEnum('role').default('DOCTOR').notNull(),
  custom_role_id: uuid('custom_role_id'),
  // Optional: auto-assign to a department on acceptance (hospital tenants)
  department_id: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  // SHA-256 of the opaque invite token
  token_hash: text('token_hash').unique().notNull(),
  invited_by: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  accepted_at: timestamp('accepted_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('staff_invitations_tenant_id_idx').on(table.tenant_id),
])

export const staffInvitationsRelations = relations(staffInvitations, ({ one }) => ({
  tenant: one(tenants, { fields: [staffInvitations.tenant_id], references: [tenants.id] }),
  inviter: one(users, { fields: [staffInvitations.invited_by], references: [users.id] }),
  department: one(departments, { fields: [staffInvitations.department_id], references: [departments.id] }),
}))

export type StaffInvitation = typeof staffInvitations.$inferSelect
export type NewStaffInvitation = typeof staffInvitations.$inferInsert
