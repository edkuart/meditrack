import { pgTable, uuid, varchar, jsonb, timestamp, pgEnum } from 'drizzle-orm/pg-core'

export const planTypeEnum = pgEnum('plan_type', ['free', 'doctor_individual', 'clinic_complete', 'pro', 'enterprise'])
export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended', 'cancelled'])
export const tenantTypeEnum = pgEnum('tenant_type', ['CLINIC', 'HOSPITAL'])

export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  type: tenantTypeEnum('type').default('CLINIC').notNull(),
  plan_type: planTypeEnum('plan_type').default('free').notNull(),
  status: tenantStatusEnum('status').default('active').notNull(),
  settings: jsonb('settings').default({}).notNull(),
  // ─── Stripe billing ──────────────────────────────────────────────────────────
  stripe_customer_id: varchar('stripe_customer_id', { length: 255 }),
  stripe_subscription_id: varchar('stripe_subscription_id', { length: 255 }),
  subscription_current_period_end: timestamp('subscription_current_period_end', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
