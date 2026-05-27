import { index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants, planTypeEnum } from './tenants.ts'
import { users } from './users.ts'

export const tenantAccessGrantTypeEnum = pgEnum('tenant_access_grant_type', [
  'trial',
  'promo',
  'manual_override',
  'internal_demo',
])

export const tenantAccessGrantStatusEnum = pgEnum('tenant_access_grant_status', [
  'active',
  'expired',
  'revoked',
  'converted',
])

export const tenantAccessGrants = pgTable('tenant_access_grants', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  grant_type: tenantAccessGrantTypeEnum('grant_type').default('trial').notNull(),
  plan_type: planTypeEnum('plan_type').notNull(),
  status: tenantAccessGrantStatusEnum('status').default('active').notNull(),
  starts_at: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
  ends_at: timestamp('ends_at', { withTimezone: true }).notNull(),
  reason: varchar('reason', { length: 500 }).notNull(),
  notes: text('notes'),
  max_ai_units_monthly: integer('max_ai_units_monthly'),
  max_organizations: integer('max_organizations'),
  max_staff: integer('max_staff'),
  max_patients: integer('max_patients'),
  granted_by: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
  revoked_by: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('tenant_access_grants_tenant_status_idx').on(table.tenant_id, table.status, table.ends_at),
  index('tenant_access_grants_granted_by_idx').on(table.granted_by),
])

export const tenantAccessGrantsRelations = relations(tenantAccessGrants, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantAccessGrants.tenant_id], references: [tenants.id] }),
  grantedBy: one(users, { fields: [tenantAccessGrants.granted_by], references: [users.id] }),
  revokedBy: one(users, { fields: [tenantAccessGrants.revoked_by], references: [users.id] }),
}))

export type TenantAccessGrant = typeof tenantAccessGrants.$inferSelect
export type NewTenantAccessGrant = typeof tenantAccessGrants.$inferInsert
