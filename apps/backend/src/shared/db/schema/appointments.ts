import { pgTable, uuid, text, integer, timestamp, pgEnum, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tenants } from './tenants.ts'
import { patients } from './patients.ts'
import { users } from './users.ts'
import { locations } from './locations.ts'

export const appointmentTypeEnum = pgEnum('appointment_type', [
  'CONSULTATION',
  'FOLLOW_UP',
  'PROCEDURE',
  'CHECK_UP',
  'EMERGENCY',
  'TELECONSULT',
])

export const appointmentStatusEnum = pgEnum('appointment_status', [
  'SCHEDULED',
  'CONFIRMED',
  'WAITING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
])

export const appointments = pgTable('appointments', {
  id:               uuid('id').defaultRandom().primaryKey(),
  tenant_id:        uuid('tenant_id').references(() => tenants.id,  { onDelete: 'restrict' }).notNull(),
  patient_id:       uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }).notNull(),
  doctor_id:        uuid('doctor_id').references(() => users.id,    { onDelete: 'restrict' }).notNull(),
  location_id:      uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
  scheduled_at:     timestamp('scheduled_at', { withTimezone: true }).notNull(),
  duration_minutes: integer('duration_minutes').default(30).notNull(),
  type:             appointmentTypeEnum('type').default('CONSULTATION').notNull(),
  status:           appointmentStatusEnum('status').default('SCHEDULED').notNull(),
  reason:           text('reason'),
  notes:            text('notes'),
  cancelled_reason: text('cancelled_reason'),
  created_by:       uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  created_at:       timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at:       timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('appointments_tenant_idx').on(t.tenant_id),
  index('appointments_patient_idx').on(t.patient_id),
  index('appointments_doctor_idx').on(t.doctor_id),
  index('appointments_scheduled_at_idx').on(t.tenant_id, t.scheduled_at),
  index('appointments_status_idx').on(t.tenant_id, t.status),
])

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  tenant:   one(tenants,   { fields: [appointments.tenant_id],   references: [tenants.id]   }),
  patient:  one(patients,  { fields: [appointments.patient_id],  references: [patients.id]  }),
  doctor:   one(users,     { fields: [appointments.doctor_id],   references: [users.id],   relationName: 'appointment_doctor'   }),
  location: one(locations, { fields: [appointments.location_id], references: [locations.id] }),
  created_by_user: one(users, { fields: [appointments.created_by], references: [users.id], relationName: 'appointment_created_by' }),
}))

export type Appointment = typeof appointments.$inferSelect
export type NewAppointment = typeof appointments.$inferInsert
