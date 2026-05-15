-- Backfill the patient-level vital sign timestamp expected by the app schema.
-- Some deployed databases had vital_signs before recorded_at was introduced.
ALTER TABLE "vital_signs"
  ADD COLUMN IF NOT EXISTS "recorded_at" timestamp with time zone DEFAULT now() NOT NULL;
