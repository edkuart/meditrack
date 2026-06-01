import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.ts'
import { referrals } from './referrals.ts'
import { patients } from './patients.ts'
import { tenants } from './tenants.ts'

// Stored as varchar(50) — new types can be added without DB migrations
export const DOCTOR_NOTIF_TYPES = [
  'REFERRAL_CREATED',
  'REFERRAL_ACCEPTED',
  'REFERRAL_REJECTED',
  'REFERRAL_COMPLETED',
  'REFERRAL_CANCELLED',
  'DOCUMENT_UPLOADED',
  'LAB_RESULT_READY',
  'PATIENT_CHECKIN_ALERT',
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_CANCELLED',
  'EXTERNAL_LAB_SUBMITTED',
] as const

export type DoctorNotifType = typeof DOCTOR_NOTIF_TYPES[number]

export const doctorNotifications = pgTable('doctor_notifications', {
  id:           uuid('id').defaultRandom().primaryKey(),
  tenant_id:    uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  recipient_id: uuid('recipient_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  referral_id:  uuid('referral_id').references(() => referrals.id, { onDelete: 'cascade' }),
  patient_id:   uuid('patient_id').references(() => patients.id, { onDelete: 'cascade' }).notNull(),
  type:         varchar('type', { length: 50 }).notNull(),
  title:        varchar('title', { length: 200 }).notNull(),
  body:         text('body').notNull(),
  metadata:     jsonb('metadata'),
  is_read:      boolean('is_read').default(false).notNull(),
  created_at:   timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('doc_notif_recipient_idx').on(t.recipient_id, t.created_at),
  index('doc_notif_tenant_idx').on(t.tenant_id, t.is_read),
])

export const doctorNotificationsRelations = relations(doctorNotifications, ({ one }) => ({
  recipient: one(users,    { fields: [doctorNotifications.recipient_id], references: [users.id] }),
  referral:  one(referrals,{ fields: [doctorNotifications.referral_id],  references: [referrals.id] }),
  patient:   one(patients, { fields: [doctorNotifications.patient_id],   references: [patients.id] }),
}))

export type DoctorNotification    = typeof doctorNotifications.$inferSelect
export type NewDoctorNotification = typeof doctorNotifications.$inferInsert
