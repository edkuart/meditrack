import { eq, and, desc } from 'drizzle-orm'
import { db, doctorNotifications } from '../../shared/db/index.ts'
import type { DoctorNotification } from '../../shared/db/schema/doctor-notifications.ts'

export type DoctorNotifType = DoctorNotification['type']

export async function createDoctorNotification(params: {
  tenant_id: string
  recipient_id: string
  referral_id: string
  patient_id: string
  type: DoctorNotifType
  title: string
  body: string
}): Promise<void> {
  await db.insert(doctorNotifications).values(params)
}

export async function listDoctorNotifications(tenantId: string, recipientId: string, limit = 40) {
  return db.query.doctorNotifications.findMany({
    where: and(
      eq(doctorNotifications.tenant_id, tenantId),
      eq(doctorNotifications.recipient_id, recipientId),
    ),
    orderBy: desc(doctorNotifications.created_at),
    limit,
    with: {
      patient: { columns: { id: true, first_name: true, last_name: true, mrn: true } },
    },
  })
}

export async function markNotificationRead(tenantId: string, recipientId: string, notifId: string) {
  await db
    .update(doctorNotifications)
    .set({ is_read: true })
    .where(
      and(
        eq(doctorNotifications.id, notifId),
        eq(doctorNotifications.tenant_id, tenantId),
        eq(doctorNotifications.recipient_id, recipientId),
      ),
    )
}

export async function markAllNotificationsRead(tenantId: string, recipientId: string) {
  await db
    .update(doctorNotifications)
    .set({ is_read: true })
    .where(
      and(
        eq(doctorNotifications.tenant_id, tenantId),
        eq(doctorNotifications.recipient_id, recipientId),
        eq(doctorNotifications.is_read, false),
      ),
    )
}
