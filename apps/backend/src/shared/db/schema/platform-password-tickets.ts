import { relations } from 'drizzle-orm'
import { index, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { tenants } from './tenants.ts'
import { users } from './users.ts'

export const platformTicketStatusEnum = pgEnum('platform_ticket_status', [
  'OPEN',
  'IN_REVIEW',
  'RESOLVED',
  'REJECTED',
])

export const platformTicketSourceEnum = pgEnum('platform_ticket_source', [
  'LOGIN_HELP',
  'AUTHENTICATED_PROFILE',
])

export const platformPasswordTickets = pgTable('platform_password_tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  user_id: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  requester_email: varchar('requester_email', { length: 254 }).notNull(),
  requester_name: varchar('requester_name', { length: 220 }),
  source: platformTicketSourceEnum('source').default('LOGIN_HELP').notNull(),
  status: platformTicketStatusEnum('status').default('OPEN').notNull(),
  message: text('message'),
  admin_notes: text('admin_notes'),
  resolved_by: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  resolved_at: timestamp('resolved_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('ppt_status_idx').on(t.status),
  index('ppt_user_idx').on(t.user_id),
  index('ppt_tenant_idx').on(t.tenant_id),
  index('ppt_created_at_idx').on(t.created_at),
])

export const platformPasswordTicketsRelations = relations(platformPasswordTickets, ({ one }) => ({
  tenant: one(tenants, { fields: [platformPasswordTickets.tenant_id], references: [tenants.id] }),
  user: one(users, { fields: [platformPasswordTickets.user_id], references: [users.id] }),
  resolver: one(users, { fields: [platformPasswordTickets.resolved_by], references: [users.id] }),
}))

export type PlatformPasswordTicket = typeof platformPasswordTickets.$inferSelect
