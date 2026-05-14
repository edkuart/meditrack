-- ─── AI Premium Usage Ledger ─────────────────────────────────────────────────
-- Tracks metered AI usage by tenant for billing, limits and auditability.

CREATE TYPE "public"."ai_usage_feature" AS ENUM(
  'ENCOUNTER_SUMMARY',
  'PATIENT_SIMPLIFICATION',
  'CLINICAL_COPILOT',
  'DOCUMENT_EXTRACTION',
  'TRANSCRIPTION',
  'OTHER'
);

ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'AI_USAGE_RECORDED';

CREATE TABLE "ai_usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "patient_id" uuid REFERENCES "patients"("id") ON DELETE SET NULL,
  "encounter_id" uuid REFERENCES "encounters"("id") ON DELETE SET NULL,
  "feature" "ai_usage_feature" NOT NULL,
  "provider" varchar(80) NOT NULL DEFAULT 'local',
  "model" varchar(120) NOT NULL,
  "units" integer NOT NULL DEFAULT 1,
  "input_tokens" integer,
  "output_tokens" integer,
  "estimated_cost_cents" integer NOT NULL DEFAULT 0,
  "resource_type" varchar(50),
  "resource_id" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "ai_usage_tenant_created_idx" ON "ai_usage_events" ("tenant_id", "created_at");
CREATE INDEX "ai_usage_actor_created_idx" ON "ai_usage_events" ("actor_id", "created_at");
CREATE INDEX "ai_usage_patient_created_idx" ON "ai_usage_events" ("patient_id", "created_at");
CREATE INDEX "ai_usage_feature_created_idx" ON "ai_usage_events" ("feature", "created_at");

ALTER TABLE "ai_usage_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_ai_usage_events ON "ai_usage_events"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);
