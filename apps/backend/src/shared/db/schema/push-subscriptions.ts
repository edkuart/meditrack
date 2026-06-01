import { pgTable, uuid, text, varchar, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.ts'
import { tenants } from './tenants.ts'

export const pushSubscriptions = pgTable('push_subscriptions', {
  id:          uuid('id').defaultRandom().primaryKey(),
  user_id:     uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tenant_id:   uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  endpoint:    text('endpoint').notNull(),
  p256dh:      text('p256dh').notNull(),
  auth:        text('auth').notNull(),
  user_agent:  varchar('user_agent', { length: 300 }),
  created_at:  timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  last_used_at:timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique('push_subscriptions_endpoint_unique').on(t.user_id, t.endpoint),
  index('push_sub_user_idx').on(t.user_id),
])

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user:   one(users,   { fields: [pushSubscriptions.user_id],   references: [users.id] }),
  tenant: one(tenants, { fields: [pushSubscriptions.tenant_id], references: [tenants.id] }),
}))

export type PushSubscription    = typeof pushSubscriptions.$inferSelect
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert
