-- ============================================================
-- Row Level Security (RLS) Policies
-- Tenant isolation: every query is filtered by tenant_id
-- injected from the app via SET LOCAL app.current_tenant_id
-- ============================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dose_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
-- audit_logs is append-only; SUPER_ADMIN bypasses RLS for it

-- ─── RLS Policies ─────────────────────────────────────────────────────────────

CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_patients ON patients
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_patient_access_tokens ON patient_access_tokens
  USING (
    patient_id IN (
      SELECT id FROM patients
      WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY tenant_isolation_encounters ON encounters
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_treatment_plans ON treatment_plans
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_medication_items ON medication_items
  USING (
    treatment_plan_id IN (
      SELECT id FROM treatment_plans
      WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY tenant_isolation_dose_events ON dose_events
  USING (
    patient_id IN (
      SELECT id FROM patients
      WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

CREATE POLICY tenant_isolation_documents ON documents
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_notification_logs ON notification_logs
  USING (
    patient_id IN (
      SELECT id FROM patients
      WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
  );

-- ─── Audit Log: append-only enforcement ───────────────────────────────────────

-- Prevent any UPDATE or DELETE on audit_logs at the DB level
CREATE RULE no_update_audit_logs AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE no_delete_audit_logs AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- ─── Updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_encounters_updated_at BEFORE UPDATE ON encounters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_treatment_plans_updated_at BEFORE UPDATE ON treatment_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
