-- Phase 10: clinical data integrity and query-path indexes.
-- These indexes support tenant-scoped patient lists, active treatment lookups,
-- pending dose queues, and audit trail investigations.

CREATE INDEX IF NOT EXISTS patients_tenant_active_created_idx
  ON patients(tenant_id, created_at DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS treatment_plans_tenant_patient_status_idx
  ON treatment_plans(tenant_id, patient_id, status);

CREATE INDEX IF NOT EXISTS treatment_plans_tenant_encounter_idx
  ON treatment_plans(tenant_id, encounter_id);

CREATE INDEX IF NOT EXISTS medication_items_plan_active_idx
  ON medication_items(treatment_plan_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS dose_events_patient_pending_scheduled_idx
  ON dose_events(patient_id, scheduled_at)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS dose_events_medication_pending_scheduled_idx
  ON dose_events(medication_item_id, scheduled_at)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS dose_events_patient_status_scheduled_idx
  ON dose_events(patient_id, status, scheduled_at);

CREATE INDEX IF NOT EXISTS audit_logs_tenant_resource_created_idx
  ON audit_logs(tenant_id, resource_type, resource_id, created_at DESC);
