import { describe, it, expect } from 'vitest'
import { generateDoseSchedule } from './schedule.engine.ts'

const baseMed = {
  drug_name: 'Amoxicilina',
  dose_amount: 1,
  dose_unit: 'tableta',
  with_food: false,
  sort_order: 0,
}

describe('generateDoseSchedule', () => {
  describe('AS_NEEDED', () => {
    it('generates no events', () => {
      const result = generateDoseSchedule(
        { ...baseMed, frequency_type: 'AS_NEEDED' },
        '2026-05-10',
      )
      expect(result).toHaveLength(0)
    })
  })

  describe('EVERY_X_HOURS', () => {
    it('generates 3 doses/day for 7 days with 8h interval', () => {
      const result = generateDoseSchedule(
        { ...baseMed, frequency_type: 'EVERY_X_HOURS', frequency_value: 8, duration_days: 7 },
        '2026-05-10',
      )
      expect(result).toHaveLength(21)
    })

    it('each dose has can_edit_until = scheduled_at + 24h', () => {
      const result = generateDoseSchedule(
        { ...baseMed, frequency_type: 'EVERY_X_HOURS', frequency_value: 8, duration_days: 1 },
        '2026-05-10',
      )
      for (const dose of result) {
        const diffMs = dose.can_edit_until.getTime() - dose.scheduled_at.getTime()
        expect(diffMs).toBe(24 * 60 * 60 * 1000)
      }
    })

    it('doses are in ascending order', () => {
      const result = generateDoseSchedule(
        { ...baseMed, frequency_type: 'EVERY_X_HOURS', frequency_value: 6, duration_days: 2 },
        '2026-05-10',
      )
      for (let i = 1; i < result.length; i++) {
        expect(result[i]!.scheduled_at.getTime()).toBeGreaterThan(result[i - 1]!.scheduled_at.getTime())
      }
    })
  })

  describe('DAILY', () => {
    it('generates 2 doses/day × 5 days = 10 events', () => {
      const result = generateDoseSchedule(
        {
          ...baseMed,
          frequency_type: 'DAILY',
          times_per_day: ['08:00', '20:00'],
          duration_days: 5,
        },
        '2026-05-10',
      )
      expect(result).toHaveLength(10)
    })

    it('defaults to 1 dose when times_per_day is not provided', () => {
      const result = generateDoseSchedule(
        { ...baseMed, frequency_type: 'DAILY', duration_days: 3 },
        '2026-05-10',
      )
      expect(result).toHaveLength(3)
    })
  })

  describe('WEEKLY', () => {
    it('generates 1 event for 7-day duration', () => {
      const result = generateDoseSchedule(
        { ...baseMed, frequency_type: 'WEEKLY', times_per_day: ['08:00'], duration_days: 7 },
        '2026-05-10',
      )
      expect(result).toHaveLength(1)
    })

    it('generates 2 events for 14-day duration', () => {
      const result = generateDoseSchedule(
        { ...baseMed, frequency_type: 'WEEKLY', times_per_day: ['08:00'], duration_days: 14 },
        '2026-05-10',
      )
      expect(result).toHaveLength(2)
    })
  })
})
