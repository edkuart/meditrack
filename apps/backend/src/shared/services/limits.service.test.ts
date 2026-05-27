import { describe, it, expect } from 'vitest'
import { PLAN_LIMITS } from './limits.service.ts'

describe('PLAN_LIMITS constants', () => {
  it('free plan has restrictive caps', () => {
    expect(PLAN_LIMITS.free.max_patients).toBe(50)
    expect(PLAN_LIMITS.free.max_staff).toBe(1)
  })

  it('doctor individual plan has consultorio caps', () => {
    expect(PLAN_LIMITS.doctor_individual.max_patients).toBe(500)
    expect(PLAN_LIMITS.doctor_individual.max_staff).toBe(1)
    expect(PLAN_LIMITS.doctor_individual.max_patients).toBeGreaterThan(PLAN_LIMITS.free.max_patients)
  })

  it('clinic complete plan has team-oriented caps', () => {
    expect(PLAN_LIMITS.clinic_complete.max_patients).toBe(2500)
    expect(PLAN_LIMITS.clinic_complete.max_staff).toBe(12)
    expect(PLAN_LIMITS.clinic_complete.max_patients).toBeGreaterThan(PLAN_LIMITS.doctor_individual.max_patients)
    expect(PLAN_LIMITS.clinic_complete.max_staff).toBeGreaterThan(PLAN_LIMITS.doctor_individual.max_staff)
  })

  it('legacy enterprise plan still signals unlimited with -1', () => {
    expect(PLAN_LIMITS.enterprise.max_patients).toBe(-1)
    expect(PLAN_LIMITS.enterprise.max_staff).toBe(-1)
  })

  it('all expected plan tiers exist', () => {
    expect(Object.keys(PLAN_LIMITS)).toEqual(
      expect.arrayContaining(['free', 'doctor_individual', 'clinic_complete', 'pro', 'enterprise']),
    )
  })

  it('each plan has both max_patients and max_staff fields', () => {
    for (const plan of Object.values(PLAN_LIMITS)) {
      expect('max_patients' in plan).toBe(true)
      expect('max_staff' in plan).toBe(true)
    }
  })

  it('limits are ordered free < doctor individual < clinic complete', () => {
    expect(PLAN_LIMITS.free.max_patients).toBeLessThan(PLAN_LIMITS.doctor_individual.max_patients)
    expect(PLAN_LIMITS.doctor_individual.max_patients).toBeLessThan(PLAN_LIMITS.clinic_complete.max_patients)
    expect(PLAN_LIMITS.doctor_individual.max_staff).toBeLessThan(PLAN_LIMITS.clinic_complete.max_staff)
  })
})
