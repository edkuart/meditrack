-- Allow patient-level clinical observations outside a specific encounter.
-- This aligns vital_signs with FHIR Observation semantics: subject/patient is required,
-- encounter context is useful but optional.
ALTER TABLE "vital_signs"
  ALTER COLUMN "encounter_id" DROP NOT NULL;
