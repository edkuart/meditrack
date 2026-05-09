-- Fase 15: tenant-scoped clinical workflow protocols.
-- Protocols are assistive templates; clinicians still review and save treatment plans manually.

CREATE TABLE IF NOT EXISTS clinical_protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(200) NOT NULL,
  category varchar(80) NOT NULL DEFAULT 'GENERAL',
  description text,
  encounter_type encounter_type,
  note_template text,
  summary_template text,
  treatment_name varchar(200),
  treatment_instructions text,
  medications jsonb NOT NULL,
  follow_up_days integer,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clinical_protocols_tenant_active_idx
  ON clinical_protocols(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS clinical_protocols_tenant_category_idx
  ON clinical_protocols(tenant_id, category);

ALTER TABLE clinical_protocols ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_clinical_protocols ON clinical_protocols;
CREATE POLICY tenant_isolation_clinical_protocols ON clinical_protocols
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
