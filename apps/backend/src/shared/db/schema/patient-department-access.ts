import { pgTable, uuid, varchar, text, timestamp, pgEnum, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'
import { departments } from './departments.ts'
import { users } from './users.ts'

export const deptAccessTypeEnum = pgEnum('dept_access_type', ['FULL', 'READ_ONLY', 'LAB_ONLY'])

export const patientDepartmentAccess = pgTable('patient_department_access', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'cascade' }).notNull(),
  department_id: uuid('department_id').references(() => departments.id, { onDelete: 'cascade' }).notNull(),
  granted_by: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
  granted_at: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  access_type: deptAccessTypeEnum('access_type').default('READ_ONLY').notNull(),
  notes: text('notes'),
}, (t) => [
  unique('pda_patient_dept_unique').on(t.patient_id, t.department_id),
  index('pda_tenant_idx').on(t.tenant_id),
  index('pda_patient_idx').on(t.patient_id),
  index('pda_dept_idx').on(t.department_id),
])

export const patientDepartmentAccessRelations = relations(patientDepartmentAccess, ({ one }) => ({
  tenant: one(tenants, { fields: [patientDepartmentAccess.tenant_id], references: [tenants.id] }),
  patient: one(patients, { fields: [patientDepartmentAccess.patient_id], references: [patients.id] }),
  department: one(departments, { fields: [patientDepartmentAccess.department_id], references: [departments.id] }),
  granted_by_user: one(users, { fields: [patientDepartmentAccess.granted_by], references: [users.id] }),
}))

export type PatientDepartmentAccess = typeof patientDepartmentAccess.$inferSelect
export type NewPatientDepartmentAccess = typeof patientDepartmentAccess.$inferInsert
