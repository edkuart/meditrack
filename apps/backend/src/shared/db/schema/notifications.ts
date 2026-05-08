import { pgTable, uuid, varchar, text, timestamp, pgEnum, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { patients } from './patients.ts'
import { doseEvents } from './treatments.ts'

export const notificationChannelEnum = pgEnum('notification_channel', [
  'email',
  'sms',
  'whatsapp',
  'push',
])

export const notificationTypeEnum = pgEnum('notification_type', [
  'DOSE_REMINDER',
  'DOSE_MISSED',
  'TREATMENT_STARTING',
  'TREATMENT_ENDING',
  'APPOINTMENT',
  'WELCOME',
  'MAGIC_LINK',
])

export const notificationStatusEnum = pgEnum('notification_status', [
  'QUEUED',
  'SENT',
  'DELIVERED',
  'FAILED',
  'BOUNCED',
])

export const notificationLogs = pgTable('notification_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  patient_id: uuid('patient_id').references(() => patients.id, { onDelete: 'cascade' }).notNull(),
  dose_event_id: uuid('dose_event_id').references(() => doseEvents.id, { onDelete: 'set null' }),
  channel: notificationChannelEnum('channel').notNull(),
  type: notificationTypeEnum('type').notNull(),
  status: notificationStatusEnum('status').default('QUEUED').notNull(),
  recipient: varchar('recipient', { length: 254 }).notNull(),
  provider_message_id: varchar('provider_message_id', { length: 200 }),
  // Snapshot of sent content for audit purposes
  content_snapshot: jsonb('content_snapshot'),
  sent_at: timestamp('sent_at', { withTimezone: true }),
  delivered_at: timestamp('delivered_at', { withTimezone: true }),
  failed_reason: text('failed_reason'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('notif_patient_id_idx').on(table.patient_id),
  index('notif_dose_event_id_idx').on(table.dose_event_id),
  index('notif_status_idx').on(table.status, table.created_at),
])

export const notificationLogsRelations = relations(notificationLogs, ({ one }) => ({
  patient: one(patients, { fields: [notificationLogs.patient_id], references: [patients.id] }),
  dose_event: one(doseEvents, { fields: [notificationLogs.dose_event_id], references: [doseEvents.id] }),
}))

export type NotificationLog = typeof notificationLogs.$inferSelect
export type NewNotificationLog = typeof notificationLogs.$inferInsert
