import { pgTable, uuid, text, varchar, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'
import { users } from './users.ts'
import { departments } from './departments.ts'
import { encounters } from './encounters.ts'

export const referralPriorityEnum = pgEnum('referral_priority', [
  'ROUTINE',
  'URGENT',
  'EMERGENCY',
])

export const referralStatusEnum = pgEnum('referral_status', [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'COMPLETED',
  'CANCELLED',
])

export const referrals = pgTable('referrals', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }).notNull(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  from_doctor_id: uuid('from_doctor_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  to_doctor_id: uuid('to_doctor_id').references(() => users.id, { onDelete: 'set null' }),
  to_department_id: uuid('to_department_id').references(() => departments.id, { onDelete: 'set null' }),
  encounter_id: uuid('encounter_id').references(() => encounters.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(),
  notes: text('notes'),
  priority: referralPriorityEnum('priority').default('ROUTINE').notNull(),
  status: referralStatusEnum('status').default('PENDING').notNull(),
  response_notes: text('response_notes'),
  responded_at: timestamp('responded_at', { withTimezone: true }),
  completed_at: timestamp('completed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('referrals_tenant_idx').on(t.tenant_id),
  index('referrals_patient_idx').on(t.patient_id),
  index('referrals_from_doctor_idx').on(t.from_doctor_id),
  index('referrals_to_doctor_idx').on(t.to_doctor_id),
  index('referrals_status_idx').on(t.tenant_id, t.status),
])

export const referralsRelations = relations(referrals, ({ one }) => ({
  tenant: one(tenants, { fields: [referrals.tenant_id], references: [tenants.id] }),
  patient: one(patients, { fields: [referrals.patient_id], references: [patients.id] }),
  from_doctor: one(users, {
    fields: [referrals.from_doctor_id],
    references: [users.id],
    relationName: 'from_doctor',
  }),
  to_doctor: one(users, {
    fields: [referrals.to_doctor_id],
    references: [users.id],
    relationName: 'to_doctor',
  }),
  to_department: one(departments, { fields: [referrals.to_department_id], references: [departments.id] }),
  encounter: one(encounters, { fields: [referrals.encounter_id], references: [encounters.id] }),
}))

export type Referral = typeof referrals.$inferSelect
export type NewReferral = typeof referrals.$inferInsert
