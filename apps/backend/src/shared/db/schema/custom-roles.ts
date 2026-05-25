import { relations } from 'drizzle-orm'
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { tenants } from './tenants.ts'
import { userRoleEnum } from './users.ts'

export const customRoles = pgTable('custom_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  base_role: userRoleEnum('base_role').default('DOCTOR').notNull(),
  permissions: jsonb('permissions').$type<string[]>().default([]).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  created_by: uuid('created_by'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('custom_roles_tenant_id_idx').on(table.tenant_id),
  uniqueIndex('custom_roles_tenant_name_uidx').on(table.tenant_id, table.name),
])

export const customRolesRelations = relations(customRoles, ({ one }) => ({
  tenant: one(tenants, { fields: [customRoles.tenant_id], references: [tenants.id] }),
}))

export type CustomRole = typeof customRoles.$inferSelect
export type NewCustomRole = typeof customRoles.$inferInsert
