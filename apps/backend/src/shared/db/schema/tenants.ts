import { pgTable, uuid, varchar, text, jsonb, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const planTypeEnum = pgEnum('plan_type', ['free', 'pro', 'enterprise'])
export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended', 'cancelled'])

export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  plan_type: planTypeEnum('plan_type').default('free').notNull(),
  status: tenantStatusEnum('status').default('active').notNull(),
  settings: jsonb('settings').default({}).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
