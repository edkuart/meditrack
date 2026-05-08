import { addDays, addHours, parseISO, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns'
import type { MedicationItemInput } from './treatments.schema.ts'

export interface ScheduledDose {
  scheduled_at: Date
  can_edit_until: Date
}

/**
 * Generates all dose timestamps for a medication item.
 * All times are stored in UTC; the caller passes start_date as a local date string
 * and the patient's UTC offset (defaulting to 0 for MVP — timezone support in phase 2).
 */
export function generateDoseSchedule(
  item: MedicationItemInput,
  startDateStr: string,
  utcOffsetMinutes = 0,
): ScheduledDose[] {
  const doses: ScheduledDose[] = []
  const startDate = parseISO(startDateStr)

  if (item.frequency_type === 'AS_NEEDED') {
    // AS_NEEDED: no automatic events generated
    return []
  }

  const durationDays = item.duration_days ?? 1

  if (item.frequency_type === 'EVERY_X_HOURS') {
    const intervalHours = item.frequency_value ?? 8
    // Start at 08:00 on day 0, then every X hours
    const firstDose = atTime(startDate, 8, 0, utcOffsetMinutes)
    const totalHours = durationDays * 24
    let current = firstDose

    while (current < addDays(firstDose, durationDays)) {
      doses.push(toDoseEntry(current))
      current = addHours(current, intervalHours)
    }
  }

  if (item.frequency_type === 'DAILY') {
    const times = item.times_per_day ?? ['08:00']

    for (let day = 0; day < durationDays; day++) {
      const dayDate = addDays(startDate, day)

      for (const timeStr of times) {
        const [h, m] = timeStr.split(':').map(Number)
        const doseTime = atTime(dayDate, h!, m!, utcOffsetMinutes)
        doses.push(toDoseEntry(doseTime))
      }
    }
  }

  if (item.frequency_type === 'WEEKLY') {
    // times_per_day used as weekly times e.g. ["08:00"] on every 7th day
    const times = item.times_per_day ?? ['08:00']

    for (let day = 0; day < durationDays; day += 7) {
      const dayDate = addDays(startDate, day)

      for (const timeStr of times) {
        const [h, m] = timeStr.split(':').map(Number)
        const doseTime = atTime(dayDate, h!, m!, utcOffsetMinutes)
        doses.push(toDoseEntry(doseTime))
      }
    }
  }

  return doses
}

function atTime(date: Date, hours: number, minutes: number, utcOffsetMinutes: number): Date {
  let d = setMilliseconds(setSeconds(setMinutes(setHours(date, hours), minutes), 0), 0)
  // Adjust for UTC offset: local time → UTC
  d = addHours(d, -(utcOffsetMinutes / 60))
  return d
}

function toDoseEntry(scheduled_at: Date): ScheduledDose {
  return {
    scheduled_at,
    // 24h window to edit/confirm after scheduled time
    can_edit_until: addHours(scheduled_at, 24),
  }
}
