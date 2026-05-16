-- Track antecedent lifecycle without physically deleting clinical history.

ALTER TABLE "patient_background"
  ADD COLUMN IF NOT EXISTS "retired_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "retired_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "retired_reason" text;

CREATE INDEX IF NOT EXISTS "patient_background_retired_idx"
  ON "patient_background" ("tenant_id", "patient_id", "retired_at");
