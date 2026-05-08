import { and, eq, gte, lte } from 'drizzle-orm'
import { db, doseEvents, medicationItems, patients, notificationLogs } from '../../../shared/db/index.ts'
import { sendDoseReminderNotification } from '../notifications.service.ts'

const WINDOW_MINUTES = 60

export async function runDoseReminderJob(): Promise<void> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + WINDOW_MINUTES * 60 * 1000)

  try {
    const upcoming = await db
      .select({
        doseId: doseEvents.id,
        scheduledAt: doseEvents.scheduled_at,
        patientId: doseEvents.patient_id,
        drugName: medicationItems.drug_name,
        doseAmount: medicationItems.dose_amount,
        doseUnit: medicationItems.dose_unit,
        firstName: patients.first_name,
        email: patients.email,
        phone: patients.phone,
      })
      .from(doseEvents)
      .innerJoin(medicationItems, eq(doseEvents.medication_item_id, medicationItems.id))
      .innerJoin(patients, eq(doseEvents.patient_id, patients.id))
      .where(and(
        eq(doseEvents.status, 'PENDING'),
        gte(doseEvents.scheduled_at, now),
        lte(doseEvents.scheduled_at, windowEnd),
      ))

    let sent = 0

    for (const item of upcoming) {
      if (!item.email && !item.phone) continue

      // Dedup: skip if already notified for this specific dose event
      const alreadySent = await db.query.notificationLogs.findFirst({
        where: and(
          eq(notificationLogs.dose_event_id, item.doseId),
          eq(notificationLogs.type, 'DOSE_REMINDER'),
        ),
        columns: { id: true },
      })
      if (alreadySent) continue

      await sendDoseReminderNotification(
        { id: item.patientId, first_name: item.firstName, email: item.email, phone: item.phone },
        item.doseId,
        item.scheduledAt,
        item.drugName,
        item.doseAmount,
        item.doseUnit,
      )
      sent++
    }

    if (upcoming.length > 0) {
      console.log(`[dose-reminder] ${upcoming.length} upcoming — ${sent} notified`)
    }
  } catch (err) {
    console.error('[dose-reminder] job error:', err)
  }
}
