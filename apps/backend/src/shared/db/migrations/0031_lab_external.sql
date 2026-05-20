-- Lab external submissions module
-- Patients can submit lab results from external labs (PDFs, photos)
-- AI extracts structured values; doctor reviews and validates

-- ─── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE lab_external_status AS ENUM (
    'RECEIVED', 'AI_EXTRACTING', 'DRAFT_READY', 'VALIDATED', 'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE lab_extracted_value_status AS ENUM (
    'AI_DRAFT', 'ACCEPTED', 'EDITED', 'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── lab_external_submissions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lab_external_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id        UUID REFERENCES lab_orders(id) ON DELETE SET NULL,
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  status          lab_external_status NOT NULL DEFAULT 'RECEIVED',
  patient_notes   TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  ai_started_at   TIMESTAMPTZ,
  ai_completed_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lab_ext_sub_tenant_idx  ON lab_external_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS lab_ext_sub_patient_idx ON lab_external_submissions(tenant_id, patient_id);
CREATE INDEX IF NOT EXISTS lab_ext_sub_order_idx   ON lab_external_submissions(order_id);
CREATE INDEX IF NOT EXISTS lab_ext_sub_status_idx  ON lab_external_submissions(tenant_id, status);

-- ─── lab_submission_files ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lab_submission_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES lab_external_submissions(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  patient_id    UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  file_name     VARCHAR(255) NOT NULL,
  file_size     INTEGER NOT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  storage_key   TEXT NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lab_sub_files_submission_idx ON lab_submission_files(submission_id);

-- ─── lab_extracted_values ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lab_extracted_values (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   UUID NOT NULL REFERENCES lab_external_submissions(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  panel_name      VARCHAR(200) NOT NULL,
  parameter_name  VARCHAR(200) NOT NULL,
  raw_value       VARCHAR(100),
  numeric_value   NUMERIC(12, 4),
  unit            VARCHAR(50),
  ref_min         NUMERIC(12, 4),
  ref_max         NUMERIC(12, 4),
  ref_text        VARCHAR(100),
  confidence      NUMERIC(3, 2) NOT NULL DEFAULT 0,
  raw_text        VARCHAR(500),
  ai_flag         VARCHAR(10),
  status          lab_extracted_value_status NOT NULL DEFAULT 'AI_DRAFT',
  doctor_value    VARCHAR(100),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lab_extracted_submission_idx ON lab_extracted_values(submission_id);

-- ─── Audit log action types ───────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'LAB_EXTERNAL_SUBMITTED';
EXCEPTION WHEN others THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'LAB_EXTERNAL_AI_EXTRACTED';
EXCEPTION WHEN others THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'LAB_EXTERNAL_VALIDATED';
EXCEPTION WHEN others THEN null;
END $$;
