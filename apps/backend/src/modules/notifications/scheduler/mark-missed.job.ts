import { and, eq, lt } from 'drizzle-orm'
import { db, doseEvents } from '../../../shared/db/index.ts'

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
      console.log(`[mark-missed] marked ${updated.length} dose(s) as MISSED`)
    }
  } catch (err) {
    console.error('[mark-missed] job error:', err)
  }
}
