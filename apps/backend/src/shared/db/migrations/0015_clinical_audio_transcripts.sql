-- ─── Voice / Clinical Transcription Phase ───────────────────────────────────
-- Stores reviewed or provider-generated transcripts as clinical sources.

CREATE TYPE "public"."clinical_transcript_status" AS ENUM(
  'DRAFT',
  'TRANSCRIBED',
  'NEEDS_REVIEW',
  'REVIEWED',
  'ARCHIVED'
);

ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'CLINICAL_TRANSCRIPT_CREATED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'CLINICAL_TRANSCRIPT_REVIEWED';

CREATE TABLE "clinical_audio_transcripts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT,
  "encounter_id" uuid REFERENCES "encounters"("id") ON DELETE SET NULL,
  "document_id" uuid REFERENCES "documents"("id") ON DELETE SET NULL,
  "status" "clinical_transcript_status" NOT NULL DEFAULT 'TRANSCRIBED',
  "source_label" varchar(255),
  "language" varchar(20) NOT NULL DEFAULT 'es',
  "processor" varchar(100) NOT NULL DEFAULT 'manual-transcript-v1',
  "transcript_text" text NOT NULL,
  "segments" jsonb NOT NULL DEFAULT '[]',
  "summary" text,
  "duration_seconds" integer,
  "confidence" real,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "clinical_audio_transcripts_patient_idx"
  ON "clinical_audio_transcripts" ("tenant_id", "patient_id", "created_at");

CREATE INDEX "clinical_audio_transcripts_encounter_idx"
  ON "clinical_audio_transcripts" ("encounter_id", "created_at");

ALTER TABLE "clinical_audio_transcripts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_clinical_audio_transcripts ON "clinical_audio_transcripts"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

CREATE TRIGGER update_clinical_audio_transcripts_updated_at
  BEFORE UPDATE ON "clinical_audio_transcripts"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
