-- Migration: patient MRN + inter-department access control (Phase 3)
-- All DDL here is transactional (no ALTER TYPE ADD VALUE).

-- MRN column on patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS mrn varchar(20);
CREATE UNIQUE INDEX IF NOT EXISTS patients_mrn_unique ON patients(mrn);
CREATE INDEX IF NOT EXISTS patients_mrn_idx ON patients(mrn);

-- Atomic counter per tenant per year for MRN sequence generation
CREATE TABLE IF NOT EXISTS patient_mrn_counters (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year      smallint NOT NULL,
  last_seq  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, year)
);

-- dept_access_type enum (new type — safe in transaction)
CREATE TYPE dept_access_type AS ENUM ('FULL', 'READ_ONLY', 'LAB_ONLY');

-- Patient ↔ department access grants
CREATE TABLE IF NOT EXISTS patient_department_access (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  patient_id    uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  granted_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  access_type   dept_access_type NOT NULL DEFAULT 'READ_ONLY',
  notes         text,
  CONSTRAINT pda_patient_dept_unique UNIQUE (patient_id, department_id)
);
CREATE INDEX IF NOT EXISTS pda_tenant_idx  ON patient_department_access(tenant_id);
CREATE INDEX IF NOT EXISTS pda_patient_idx ON patient_department_access(patient_id);
CREATE INDEX IF NOT EXISTS pda_dept_idx    ON patient_department_access(department_id);
