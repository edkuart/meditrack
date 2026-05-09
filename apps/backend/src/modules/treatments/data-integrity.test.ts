import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const servicePath = fileURLToPath(new URL('./treatments.service.ts', import.meta.url))
const migrationPath = fileURLToPath(new URL('../../shared/db/migrations/0002_data_integrity_indexes.sql', import.meta.url))

describe('treatment data integrity guards', () => {
  it('keeps critical treatment and dose operations transactional', () => {
    const source = readFileSync(servicePath, 'utf8')

    expect(source.match(/db\.transaction/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
    expect(source).toContain('TREATMENT_CREATED')
    expect(source).toContain('TREATMENT_ACTIVATED')
    expect(source).toContain('TREATMENT_SUSPENDED')
    expect(source).toContain('DOSE_CONFIRMED')
  })

  it('cancels future dose events by medication ids, not by treatment plan id', () => {
    const source = readFileSync(servicePath, 'utf8')

    expect(source).toContain('inArray(doseEvents.medication_item_id, medIds)')
    expect(source).not.toContain('eq(doseEvents.medication_item_id, planRow.id)')
  })

  it('ships query-path indexes for patient, treatment, dose, and audit lookups', () => {
    const migration = readFileSync(migrationPath, 'utf8')

    expect(migration).toContain('patients_tenant_active_created_idx')
    expect(migration).toContain('treatment_plans_tenant_patient_status_idx')
    expect(migration).toContain('medication_items_plan_active_idx')
    expect(migration).toContain('dose_events_patient_pending_scheduled_idx')
    expect(migration).toContain("WHERE status = 'PENDING'")
    expect(migration).toContain('audit_logs_tenant_resource_created_idx')
  })
})
