-- Phase 21: Compliance & Legal Hardening

-- 1. Consent type enum
CREATE TYPE "consent_type" AS ENUM (
  'data_processing',
  'treatment',
  'third_party_sharing',
  'research',
  'marketing'
);

-- 2. Patient consents table
CREATE TABLE "patient_consents" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"          uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "patient_id"         uuid NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
  "consent_type"       consent_type NOT NULL,
  "description"        text,
  "recorded_by"        uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "recorded_by_email"  varchar(254),
  "consented_at"       timestamptz NOT NULL,
  "withdrawn_at"       timestamptz,
  "withdrawn_by"       uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "ip_address"         text,
  "notes"              text,
  "created_at"         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "patient_consents_patient_id_idx" ON "patient_consents"("patient_id");
CREATE INDEX "patient_consents_tenant_id_idx" ON "patient_consents"("tenant_id", "created_at");

-- 3. GDPR erasure flag on patients
ALTER TABLE "patients" ADD COLUMN "anonymized_at" timestamptz;

-- 4. Legal acceptance on users
ALTER TABLE "users" ADD COLUMN "tos_accepted_at"            timestamptz;
ALTER TABLE "users" ADD COLUMN "privacy_policy_accepted_at" timestamptz;

-- 5. New audit action values
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'CONSENT_RECORDED';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'CONSENT_WITHDRAWN';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'PATIENT_ANONYMIZED';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'DATA_EXPORT_REQUESTED';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'TOS_ACCEPTED';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'PRIVACY_POLICY_ACCEPTED';
ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'DATA_RETENTION_PURGE';
