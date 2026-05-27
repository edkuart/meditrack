import { pgTable, uuid, varchar, numeric, text, jsonb, timestamp, pgEnum, integer, primaryKey } from 'drizzle-orm/pg-core'
import { tenants } from './tenants.ts'
import { users } from './users.ts'

export const invoiceStatusEnum = pgEnum('invoice_status', ['pending', 'paid', 'overdue', 'cancelled', 'refunded'])
export const invoiceProviderEnum = pgEnum('invoice_provider', ['recurrente', 'stripe', 'manual'])

export const billingInvoiceCounters = pgTable('billing_invoice_counters', {
  year: integer('year').notNull(),
  next_number: integer('next_number').default(1).notNull(),
}, (t) => [
  primaryKey({ columns: [t.year] }),
])

export const billingInvoices = pgTable('billing_invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id),
  invoice_number: varchar('invoice_number', { length: 30 }).notNull().unique(),
  status: invoiceStatusEnum('status').default('pending').notNull(),
  plan_type: varchar('plan_type', { length: 50 }).notNull(),
  amount_gtq: numeric('amount_gtq', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('GTQ').notNull(),
  provider: invoiceProviderEnum('provider').notNull(),
  provider_checkout_id: varchar('provider_checkout_id', { length: 255 }),
  provider_payment_id: varchar('provider_payment_id', { length: 255 }),
  period_start: timestamp('period_start', { withTimezone: true }),
  period_end: timestamp('period_end', { withTimezone: true }),
  paid_at: timestamp('paid_at', { withTimezone: true }),
  notes: text('notes'),
  metadata: jsonb('metadata').default({}).notNull(),
  created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type BillingInvoice = typeof billingInvoices.$inferSelect
export type NewBillingInvoice = typeof billingInvoices.$inferInsert
