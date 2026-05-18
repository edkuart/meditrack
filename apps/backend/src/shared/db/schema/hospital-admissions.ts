import { pgTable, uuid, text, varchar, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'
import { users } from './users.ts'
import { departments } from './departments.ts'
import { referrals } from './referrals.ts'

export const admissionStatusEnum = pgEnum('admission_status', ['ACTIVE', 'DISCHARGED'])

export const hospitalAdmissions = pgTable('hospital_admissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  admitted_by: uuid('admitted_by').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  department_id: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
  referral_id: uuid('referral_id').references(() => referrals.id, { onDelete: 'set null' }),
  bed_code: varchar('bed_code', { length: 50 }),
  status: admissionStatusEnum('status').default('ACTIVE').notNull(),
  admission_notes: text('admission_notes'),
  discharge_notes: text('discharge_notes'),
  admitted_at: timestamp('admitted_at', { withTimezone: true }).defaultNow().notNull(),
  discharged_at: timestamp('discharged_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('admissions_tenant_idx').on(t.tenant_id),
  index('admissions_patient_idx').on(t.patient_id),
  index('admissions_status_idx').on(t.tenant_id, t.status),
  index('admissions_department_idx').on(t.department_id),
])

export const hospitalAdmissionsRelations = relations(hospitalAdmissions, ({ one }) => ({
  tenant: one(tenants, { fields: [hospitalAdmissions.tenant_id], references: [tenants.id] }),
  patient: one(patients, { fields: [hospitalAdmissions.patient_id], references: [patients.id] }),
  admitted_by_doctor: one(users, { fields: [hospitalAdmissions.admitted_by], references: [users.id] }),
  department: one(departments, { fields: [hospitalAdmissions.department_id], references: [departments.id] }),
  referral: one(referrals, { fields: [hospitalAdmissions.referral_id], references: [referrals.id] }),
}))

export type HospitalAdmission = typeof hospitalAdmissions.$inferSelect
export type NewHospitalAdmission = typeof hospitalAdmissions.$inferInsert
