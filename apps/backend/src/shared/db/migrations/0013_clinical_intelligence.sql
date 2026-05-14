-- ─── Clinical Intelligence Phase 1 ───────────────────────────────────────────
-- Provenance + review queue for extracted/imported clinical information.

CREATE TYPE "public"."clinical_source_type" AS ENUM(
  'MANUAL_ENTRY',
  'DOCUMENT_UPLOAD',
  'LAB_RESULT',
  'VITAL_SIGN',
  'ENCOUNTER_NOTE',
  'PATIENT_PORTAL',
  'AI_EXTRACTION',
  'EXTERNAL_RECORD',
  'AUDIO_TRANSCRIPT'
);

CREATE TYPE "public"."clinical_review_item_type" AS ENUM(
  'PATIENT_PROBLEM',
  'PATIENT_BACKGROUND',
  'VITAL_SIGNS',
  'LAB_RESULT',
  'ENCOUNTER_SOAP',
  'MEDICATION',
  'DOCUMENT_SUMMARY',
  'OTHER'
);

CREATE TYPE "public"."clinical_review_status" AS ENUM(
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED'
);

CREATE TYPE "public"."clinical_review_priority" AS ENUM(
  'LOW',
  'NORMAL',
  'HIGH'
);

ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'CLINICAL_PROVENANCE_RECORDED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'CLINICAL_REVIEW_CREATED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'CLINICAL_REVIEW_APPROVED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'CLINICAL_REVIEW_REJECTED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'CLINICAL_REVIEW_SUPERSEDED';

CREATE TABLE "clinical_data_provenance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT,
  "encounter_id" uuid REFERENCES "encounters"("id") ON DELETE SET NULL,
  "document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "source_type" "clinical_source_type" NOT NULL,
  "source_resource_type" varchar(50),
  "source_resource_id" uuid,
  "source_label" varchar(255),
  "source_excerpt" text,
  "source_checksum" varchar(64),
  "target_resource_type" varchar(50),
  "target_resource_id" uuid,
  "target_field" varchar(100),
  "extraction_method" varchar(80),
  "confidence" real,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "clinical_provenance_patient_idx"
  ON "clinical_data_provenance" ("tenant_id", "patient_id", "created_at");
CREATE INDEX "clinical_provenance_target_idx"
  ON "clinical_data_provenance" ("target_resource_type", "target_resource_id");
CREATE INDEX "clinical_provenance_document_idx"
  ON "clinical_data_provenance" ("document_id");

CREATE TABLE "clinical_review_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT,
  "encounter_id" uuid REFERENCES "encounters"("id") ON DELETE SET NULL,
  "document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "provenance_id" uuid REFERENCES "clinical_data_provenance"("id") ON DELETE SET NULL,
  "item_type" "clinical_review_item_type" NOT NULL,
  "status" "clinical_review_status" NOT NULL DEFAULT 'PENDING',
  "priority" "clinical_review_priority" NOT NULL DEFAULT 'NORMAL',
  "title" varchar(200) NOT NULL,
  "summary" text,
  "proposed_payload" jsonb NOT NULL DEFAULT '{}',
  "normalized_payload" jsonb NOT NULL DEFAULT '{}',
  "confidence" real,
  "reasoning" text,
  "reviewer_notes" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "clinical_review_patient_status_idx"
  ON "clinical_review_items" ("tenant_id", "patient_id", "status", "created_at");
CREATE INDEX "clinical_review_document_idx"
  ON "clinical_review_items" ("document_id");
CREATE INDEX "clinical_review_provenance_idx"
  ON "clinical_review_items" ("provenance_id");

ALTER TABLE "clinical_data_provenance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinical_review_items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_clinical_data_provenance ON "clinical_data_provenance"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_clinical_review_items ON "clinical_review_items"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

CREATE TRIGGER update_clinical_review_items_updated_at BEFORE UPDATE ON "clinical_review_items"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
