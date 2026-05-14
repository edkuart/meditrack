import {
  pgTable, uuid, text, varchar, timestamp, pgEnum,
  numeric, integer, index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'
import { users } from './users.ts'
import { encounters } from './encounters.ts'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const labOrderStatusEnum = pgEnum('lab_order_status', [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
])

export const labResultStatusEnum = pgEnum('lab_result_status', [
  'PENDING',
  'NORMAL',
  'HIGH',
  'LOW',
  'CRITICAL_HIGH',
  'CRITICAL_LOW',
])

// ─── lab_orders ───────────────────────────────────────────────────────────────

export const labOrders = pgTable('lab_orders', {
  id:           uuid('id').defaultRandom().primaryKey(),
  tenant_id:    uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id:   uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  encounter_id: uuid('encounter_id').references(() => encounters.id, { onDelete: 'set null' }),
  ordered_by:   uuid('ordered_by').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  status:       labOrderStatusEnum('status').default('PENDING').notNull(),
  notes:        text('notes'),
  ordered_at:   timestamp('ordered_at', { withTimezone: true }).defaultNow().notNull(),
  created_at:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at:   timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('lab_orders_tenant_idx').on(t.tenant_id),
  index('lab_orders_patient_idx').on(t.tenant_id, t.patient_id),
  index('lab_orders_ordered_at_idx').on(t.tenant_id, t.ordered_at),
])

export const labOrdersRelations = relations(labOrders, ({ one, many }) => ({
  tenant:    one(tenants,   { fields: [labOrders.tenant_id],    references: [tenants.id] }),
  patient:   one(patients,  { fields: [labOrders.patient_id],   references: [patients.id] }),
  encounter: one(encounters,{ fields: [labOrders.encounter_id], references: [encounters.id] }),
  doctor:    one(users,     { fields: [labOrders.ordered_by],   references: [users.id] }),
  results:   many(labResults),
}))

// ─── lab_results ──────────────────────────────────────────────────────────────

export const labResults = pgTable('lab_results', {
  id:              uuid('id').defaultRandom().primaryKey(),
  order_id:        uuid('order_id').references(() => labOrders.id, { onDelete: 'cascade' }).notNull(),
  tenant_id:       uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  panel_name:      varchar('panel_name', { length: 200 }).notNull(),
  parameter_name:  varchar('parameter_name', { length: 200 }).notNull(),
  value:           varchar('value', { length: 100 }),
  numeric_value:   numeric('numeric_value', { precision: 12, scale: 4 }),
  unit:            varchar('unit', { length: 50 }),
  ref_min:         numeric('ref_min', { precision: 12, scale: 4 }),
  ref_max:         numeric('ref_max', { precision: 12, scale: 4 }),
  ref_text:        varchar('ref_text', { length: 100 }),
  status:          labResultStatusEnum('status').default('PENDING').notNull(),
  notes:           text('notes'),
  sort_order:      integer('sort_order').default(0).notNull(),
  created_at:      timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at:      timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('lab_results_order_idx').on(t.order_id),
  index('lab_results_tenant_idx').on(t.tenant_id),
])

export const labResultsRelations = relations(labResults, ({ one }) => ({
  order:  one(labOrders, { fields: [labResults.order_id],  references: [labOrders.id] }),
  tenant: one(tenants,   { fields: [labResults.tenant_id], references: [tenants.id] }),
}))

export type LabOrder    = typeof labOrders.$inferSelect
export type NewLabOrder = typeof labOrders.$inferInsert
export type LabResult    = typeof labResults.$inferSelect
export type NewLabResult = typeof labResults.$inferInsert
