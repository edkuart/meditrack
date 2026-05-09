import { and, eq, gte, lte } from 'drizzle-orm'
import { db, doseEvents, medicationItems, patients } from '../../../shared/db/index.ts'
import { getDoseReminderDeliveryState, sendDoseReminderNotification } from '../notifications.service.ts'
import { log } from '../../../shared/observability/logger.ts'

const WINDOW_MINUTES = 60
const MAX_REMINDERS_PER_RUN = 500

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
      .limit(MAX_REMINDERS_PER_RUN)

    let sent = 0

    for (const item of upcoming) {
      if (!item.email && !item.phone) continue

      const deliveryState = await getDoseReminderDeliveryState(item.doseId, now)
      if (!deliveryState.shouldSend) continue

      const result = await sendDoseReminderNotification(
        { id: item.patientId, first_name: item.firstName, email: item.email, phone: item.phone },
        item.doseId,
        item.scheduledAt,
        item.drugName,
        item.doseAmount,
        item.doseUnit,
        deliveryState.attemptCount,
      )
      if (result?.status === 'SENT') sent++
    }

    if (upcoming.length > 0) {
      log.info('dose_reminder.completed', {
        upcoming: upcoming.length,
        capped: upcoming.length === MAX_REMINDERS_PER_RUN,
        notified: sent,
        skipped: upcoming.length - sent,
      })
    }
  } catch (err) {
    throw err
  }
}
