import { and, eq, lt } from 'drizzle-orm'
import { db, doseEvents } from '../../../shared/db/index.ts'
import { log } from '../../../shared/observability/logger.ts'

export async function runMarkMissedJob(): Promise<void> {
  try {
    const updated = await db
      .update(doseEvents)
      .set({ status: 'MISSED' })
      .where(and(
        eq(doseEvents.status, 'PENDING'),
        lt(doseEvents.can_edit_until, new Date()),
      ))
      .returning({ id: doseEvents.id })

    if (updated.length > 0) {
      log.info('mark_missed.completed', { marked_missed: updated.length })
    }
  } catch (err) {
    throw err
  }
}
