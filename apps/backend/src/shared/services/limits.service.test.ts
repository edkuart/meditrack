import { describe, it, expect } from 'vitest'
import { PLAN_LIMITS } from './limits.service.ts'

describe('PLAN_LIMITS constants', () => {
  it('free plan has restrictive caps', () => {
    expect(PLAN_LIMITS.free.max_patients).toBe(50)
    expect(PLAN_LIMITS.free.max_staff).toBe(3)
  })

  it('pro plan has generous but finite caps', () => {
    expect(PLAN_LIMITS.pro.max_patients).toBe(2000)
    expect(PLAN_LIMITS.pro.max_staff).toBe(20)
    // Pro caps must exceed free caps
    expect(PLAN_LIMITS.pro.max_patients).toBeGreaterThan(PLAN_LIMITS.free.max_patients)
    expect(PLAN_LIMITS.pro.max_staff).toBeGreaterThan(PLAN_LIMITS.free.max_staff)
  })

  it('enterprise plan signals unlimited with -1', () => {
    expect(PLAN_LIMITS.enterprise.max_patients).toBe(-1)
    expect(PLAN_LIMITS.enterprise.max_staff).toBe(-1)
  })

  it('all expected plan tiers exist', () => {
    expect(Object.keys(PLAN_LIMITS)).toEqual(
      expect.arrayContaining(['free', 'pro', 'enterprise']),
    )
  })

  it('each plan has both max_patients and max_staff fields', () => {
    for (const plan of Object.values(PLAN_LIMITS)) {
      expect('max_patients' in plan).toBe(true)
      expect('max_staff' in plan).toBe(true)
    }
  })

  it('limits are ordered free < pro (enterprise excluded as -1 = unlimited)', () => {
    // A free clinic should hit the cap well before a pro clinic
    expect(PLAN_LIMITS.free.max_patients).toBeLessThan(PLAN_LIMITS.pro.max_patients)
    expect(PLAN_LIMITS.free.max_staff).toBeLessThan(PLAN_LIMITS.pro.max_staff)
  })
})
