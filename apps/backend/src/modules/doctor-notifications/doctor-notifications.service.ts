import { eq, and, desc } from 'drizzle-orm'
import { db, doctorNotifications } from '../../shared/db/index.ts'
import { sendPushToUser } from '../../shared/services/push.service.ts'
import type { DoctorNotifType } from '../../shared/db/schema/doctor-notifications.ts'

export type { DoctorNotifType }

export async function createDoctorNotification(params: {
  tenant_id: string
  recipient_id: string
  patient_id: string
  type: DoctorNotifType
  title: string
  body: string
  referral_id?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  await db.insert(doctorNotifications).values({
    tenant_id:    params.tenant_id,
    recipient_id: params.recipient_id,
    patient_id:   params.patient_id,
    type:         params.type,
    title:        params.title,
    body:         params.body,
    referral_id:  params.referral_id ?? null,
    metadata:     params.metadata ?? null,
  })

  // Fire-and-forget web push (silently ignores if VAPID not configured)
  const patientHref = `/patients/${params.patient_id}`
  sendPushToUser(params.recipient_id, {
    title: params.title,
    body:  params.body.length > 120 ? params.body.slice(0, 117) + '…' : params.body,
    url:   patientHref,
    tag:   params.type,
  }).catch(() => { /* push failure must never break in-app flow */ })
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
