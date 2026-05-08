import { describe, it, expect } from 'vitest'
import { buildDayAdherence, calcStreak } from './analytics.service.ts'

function makeDays(scores: number[]) {
  return scores.map((score, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (scores.length - 1 - i))
    const total = score === -1 ? 0 : 10
    const confirmed = score === -1 ? 0 : Math.round((score / 100) * 10)
    return { date: d.toISOString().slice(0, 10), confirmed, total, score }
  })
}

describe('buildDayAdherence', () => {
  it('produces one entry per day for the period', () => {
    const days = buildDayAdherence({}, 7)
    expect(days).toHaveLength(7)
  })

  it('assigns score -1 for days with no doses', () => {
    const days = buildDayAdherence({}, 3)
    expect(days.every(d => d.score === -1)).toBe(true)
    expect(days.every(d => d.total === 0)).toBe(true)
  })

  it('calculates score correctly for days with doses', () => {
    const today = new Date().toISOString().slice(0, 10)
    const byDate = {
      [today]: { CONFIRMED: 3, PENDING: 1, MISSED: 1 },
    }
    const days = buildDayAdherence(byDate, 1)
    expect(days[0].confirmed).toBe(3)
    expect(days[0].total).toBe(5)
    expect(days[0].score).toBe(60)
  })

  it('excludes CANCELLED and SUPERSEDED from totals', () => {
    const today = new Date().toISOString().slice(0, 10)
    const byDate = {
      [today]: { CONFIRMED: 4, CANCELLED: 10, SUPERSEDED: 5 },
    }
    const days = buildDayAdherence(byDate, 1)
    expect(days[0].total).toBe(4)
    expect(days[0].score).toBe(100)
  })

  it('days are ordered oldest-to-newest', () => {
    const days = buildDayAdherence({}, 5)
    for (let i = 1; i < days.length; i++) {
      expect(days[i].date >= days[i - 1].date).toBe(true)
    }
  })
})

describe('calcStreak', () => {
  it('returns 0 when last day has no doses', () => {
    const days = makeDays([-1])
    expect(calcStreak(days)).toBe(0)
  })

  it('returns 0 when last day score is below 80', () => {
    const days = makeDays([100, 100, 79])
    expect(calcStreak(days)).toBe(0)
  })

  it('counts consecutive days from today backwards with score >= 80', () => {
    const days = makeDays([50, 90, 100, 85])
    expect(calcStreak(days)).toBe(3)
  })

  it('stops at a day with no doses', () => {
    const days = makeDays([90, -1, 100, 100])
    expect(calcStreak(days)).toBe(2)
  })

  it('returns full length when all days pass', () => {
    const days = makeDays([80, 90, 100, 85, 100])
    expect(calcStreak(days)).toBe(5)
  })
})
