-- ─── Document Intelligence Phase 2 ───────────────────────────────────────────
-- Tracks document processing passes before extracted facts enter review.

CREATE TYPE "public"."document_processing_status" AS ENUM(
  'QUEUED',
  'PROCESSING',
  'NEEDS_EXTRACTION',
  'NEEDS_REVIEW',
  'COMPLETED',
  'FAILED'
);

CREATE TYPE "public"."document_processing_mode" AS ENUM(
  'LOCAL_TRIAGE',
  'EXTERNAL_AI',
  'MANUAL_EXTRACTION'
);

ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'DOCUMENT_PROCESSING_STARTED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'DOCUMENT_EXTRACTION_SUBMITTED';

CREATE TABLE "clinical_document_processing_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT,
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "encounter_id" uuid REFERENCES "encounters"("id") ON DELETE SET NULL,
  "mode" "document_processing_mode" NOT NULL DEFAULT 'LOCAL_TRIAGE',
  "status" "document_processing_status" NOT NULL DEFAULT 'QUEUED',
  "processor" varchar(100) NOT NULL DEFAULT 'meditrack-local-triage-v1',
  "extracted_text" text,
  "extracted_payload" jsonb NOT NULL DEFAULT '{}',
  "finding_count" integer NOT NULL DEFAULT 0,
  "error_message" text,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "clinical_document_jobs_document_idx"
  ON "clinical_document_processing_jobs" ("document_id", "created_at");

CREATE INDEX "clinical_document_jobs_patient_status_idx"
  ON "clinical_document_processing_jobs" ("tenant_id", "patient_id", "status", "created_at");

ALTER TABLE "clinical_document_processing_jobs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_clinical_document_processing_jobs ON "clinical_document_processing_jobs"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

CREATE TRIGGER update_clinical_document_processing_jobs_updated_at
  BEFORE UPDATE ON "clinical_document_processing_jobs"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
