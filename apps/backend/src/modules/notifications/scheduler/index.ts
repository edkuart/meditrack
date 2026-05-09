import { runDoseReminderJob } from './dose-reminder.job.ts'
import { runMarkMissedJob } from './mark-missed.job.ts'
import { registerJob, runMonitoredJob } from '../../../shared/observability/job-health.ts'
import { log } from '../../../shared/observability/logger.ts'

const REMINDER_INTERVAL_MS = 15 * 60 * 1000  // 15 min
const MISSED_INTERVAL_MS = 30 * 60 * 1000    // 30 min

export function startScheduler(): void {
  registerJob('dose-reminder')
  registerJob('mark-missed')
  log.info('scheduler.started', {
    reminder_interval_ms: REMINDER_INTERVAL_MS,
    missed_interval_ms: MISSED_INTERVAL_MS,
  })

  // Run once immediately on boot so we don't wait a full interval
  void runMonitoredJob('mark-missed', runMarkMissedJob)
  void runMonitoredJob('dose-reminder', runDoseReminderJob)

  setInterval(() => void runMonitoredJob('dose-reminder', runDoseReminderJob), REMINDER_INTERVAL_MS)
  setInterval(() => void runMonitoredJob('mark-missed', runMarkMissedJob), MISSED_INTERVAL_MS)
}
