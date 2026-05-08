import { runDoseReminderJob } from './dose-reminder.job.ts'
import { runMarkMissedJob } from './mark-missed.job.ts'

const REMINDER_INTERVAL_MS = 15 * 60 * 1000  // 15 min
const MISSED_INTERVAL_MS = 30 * 60 * 1000    // 30 min

export function startScheduler(): void {
  console.log('[scheduler] background jobs started')

  // Run once immediately on boot so we don't wait a full interval
  void runMarkMissedJob()
  void runDoseReminderJob()

  setInterval(() => void runDoseReminderJob(), REMINDER_INTERVAL_MS)
  setInterval(() => void runMarkMissedJob(), MISSED_INTERVAL_MS)
}
