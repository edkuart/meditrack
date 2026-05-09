import { describe, expect, it } from 'vitest'
import { buildEngagementProfile } from './engagement.ts'

function localDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

describe('patient engagement profile', () => {
  it('uses calm defaults when there are no scheduled doses', () => {
    const engagement = buildEngagementProfile([], { total: 0, confirmed: 0, pending: 0 })

    expect(engagement.score).toBe(100)
    expect(engagement.tone).toBe('EXCELLENT')
    expect(engagement.next_action.label).toBe('Sin dosis hoy')
    expect(engagement.week).toHaveLength(7)
  })

  it('calculates weekly score and completed days without counting cancelled doses', () => {
    const today = localDate(new Date())
    const engagement = buildEngagementProfile([
      { date: today, status: 'CONFIRMED', cnt: 2 },
      { date: today, status: 'MISSED', cnt: 1 },
      { date: today, status: 'CANCELLED', cnt: 5 },
    ], { total: 3, confirmed: 2, pending: 1 })

    expect(engagement.score).toBe(67)
    expect(engagement.total).toBe(3)
    expect(engagement.missed).toBe(1)
    expect(engagement.next_action.priority).toBe('today')
  })

  it('counts a healthy streak from today backwards', () => {
    const today = new Date()
    const rows = [0, 1, 2].map((daysAgo) => {
      const date = new Date(today)
      date.setDate(date.getDate() - daysAgo)
      return { date: localDate(date), status: 'CONFIRMED', cnt: 1 }
    })

    const engagement = buildEngagementProfile(rows, { total: 1, confirmed: 1, pending: 0 })

    expect(engagement.streak_days).toBe(3)
    expect(engagement.weekly_completed_days).toBe(3)
  })
})
