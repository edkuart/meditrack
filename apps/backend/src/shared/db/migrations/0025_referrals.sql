-- Migration: doctor referrals network (Phase 4)
-- All DDL is transactional (no ALTER TYPE ADD VALUE).

CREATE TYPE referral_priority AS ENUM ('ROUTINE', 'URGENT', 'EMERGENCY');
CREATE TYPE referral_status   AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED');

CREATE TABLE IF NOT EXISTS referrals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  patient_id       uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  from_doctor_id   uuid NOT NULL REFERENCES users(id)   ON DELETE RESTRICT,
  to_doctor_id     uuid          REFERENCES users(id)   ON DELETE SET NULL,
  to_department_id uuid          REFERENCES departments(id) ON DELETE SET NULL,
  encounter_id     uuid          REFERENCES encounters(id)  ON DELETE SET NULL,
  reason           text NOT NULL,
  notes            text,
  priority         referral_priority NOT NULL DEFAULT 'ROUTINE',
  status           referral_status   NOT NULL DEFAULT 'PENDING',
  response_notes   text,
  responded_at     timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referrals_tenant_idx     ON referrals(tenant_id);
CREATE INDEX IF NOT EXISTS referrals_patient_idx    ON referrals(patient_id);
CREATE INDEX IF NOT EXISTS referrals_from_doctor_idx ON referrals(from_doctor_id);
CREATE INDEX IF NOT EXISTS referrals_to_doctor_idx  ON referrals(to_doctor_id);
CREATE INDEX IF NOT EXISTS referrals_status_idx     ON referrals(tenant_id, status);
