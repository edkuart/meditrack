import { pgTable, uuid, varchar, boolean, timestamp, pgEnum, primaryKey, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { users } from './users.ts'
import { locations } from './locations.ts'

export const departmentTypeEnum = pgEnum('department_type', [
  'GENERAL',
  'LAB',
  'RADIOLOGY',
  'PHARMACY',
  'EMERGENCY',
  'ICU',
  'SURGERY',
  'PEDIATRICS',
  'OBSTETRICS',
  'CARDIOLOGY',
  'NEUROLOGY',
  'ONCOLOGY',
  'ORTHOPEDICS',
  'PSYCHIATRY',
  'OTHER',
])

// ─── departments ──────────────────────────────────────────────────────────────

export const departments = pgTable('departments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  type: departmentTypeEnum('type').default('GENERAL').notNull(),
  head_doctor_id: uuid('head_doctor_id').references(() => users.id, { onDelete: 'set null' }),
  location_id: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('departments_tenant_idx').on(t.tenant_id),
])

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  tenant: one(tenants, { fields: [departments.tenant_id], references: [tenants.id] }),
  head_doctor: one(users, { fields: [departments.head_doctor_id], references: [users.id] }),
  location: one(locations, { fields: [departments.location_id], references: [locations.id] }),
  members: many(departmentMembers),
}))

// ─── department_members ───────────────────────────────────────────────────────

export const departmentMembers = pgTable('department_members', {
  user_id: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  department_id: uuid('department_id').references(() => departments.id, { onDelete: 'cascade' }).notNull(),
  joined_at: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.user_id, t.department_id] }),
  index('dept_members_user_idx').on(t.user_id),
  index('dept_members_dept_idx').on(t.department_id),
])

export const departmentMembersRelations = relations(departmentMembers, ({ one }) => ({
  user: one(users, { fields: [departmentMembers.user_id], references: [users.id] }),
  department: one(departments, { fields: [departmentMembers.department_id], references: [departments.id] }),
}))

export type Department = typeof departments.$inferSelect
export type NewDepartment = typeof departments.$inferInsert
export type DepartmentMember = typeof departmentMembers.$inferSelect
