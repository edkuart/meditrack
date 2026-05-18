-- Migration: hospital admissions (Phase 5)
-- Note: ALTER TYPE audit_action ADD VALUE is applied separately (cannot run inside a transaction).

DO $$ BEGIN
  CREATE TYPE admission_status AS ENUM ('ACTIVE', 'DISCHARGED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS hospital_admissions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id)      ON DELETE RESTRICT,
  patient_id       uuid        NOT NULL REFERENCES patients(id)     ON DELETE RESTRICT,
  admitted_by      uuid        NOT NULL REFERENCES users(id)        ON DELETE RESTRICT,
  department_id    uuid                 REFERENCES departments(id)  ON DELETE SET NULL,
  referral_id      uuid                 REFERENCES referrals(id)    ON DELETE SET NULL,
  bed_code         varchar(50),
  status           admission_status NOT NULL DEFAULT 'ACTIVE',
  admission_notes  text,
  discharge_notes  text,
  admitted_at      timestamptz NOT NULL DEFAULT now(),
  discharged_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admissions_tenant_idx     ON hospital_admissions(tenant_id);
CREATE INDEX IF NOT EXISTS admissions_patient_idx    ON hospital_admissions(patient_id);
CREATE INDEX IF NOT EXISTS admissions_status_idx     ON hospital_admissions(tenant_id, status);
CREATE INDEX IF NOT EXISTS admissions_department_idx ON hospital_admissions(department_id);
