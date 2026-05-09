import { describe, expect, it } from 'vitest'
import {
  filterClinicalProtocols,
  SYSTEM_CLINICAL_PROTOCOLS,
  validateSystemClinicalProtocols,
} from './clinical-protocols.catalog.ts'

describe('clinical protocol catalog', () => {
  it('ships clinically safe protocol defaults within treatment limits', () => {
    expect(validateSystemClinicalProtocols()).toBe(true)
    expect(SYSTEM_CLINICAL_PROTOCOLS.length).toBeGreaterThanOrEqual(3)
    expect(SYSTEM_CLINICAL_PROTOCOLS.every(protocol => protocol.medications.length <= 20)).toBe(true)
  })

  it('filters protocols by category', () => {
    const results = filterClinicalProtocols(SYSTEM_CLINICAL_PROTOCOLS, { category: 'CHRONIC_CARE' })
    expect(results).toHaveLength(1)
    expect(results[0].name).toContain('Control crónico')
  })

  it('searches names, tags, descriptions and medication placeholders', () => {
    const results = filterClinicalProtocols(SYSTEM_CLINICAL_PROTOCOLS, { q: 'post-alta' })
    expect(results.map(protocol => protocol.id)).toContain('system-post-discharge')
  })
})
