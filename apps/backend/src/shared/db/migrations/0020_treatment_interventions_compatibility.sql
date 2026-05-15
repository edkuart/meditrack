-- Repair deployed databases that predate or partially missed treatment interventions.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'intervention_type'
  ) THEN
    CREATE TYPE "public"."intervention_type" AS ENUM('EXERCISE', 'DIET', 'THERAPY', 'MONITORING', 'OTHER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "treatment_interventions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "treatment_plan_id" uuid NOT NULL REFERENCES "treatment_plans"("id") ON DELETE CASCADE,
  "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT,
  "type" "public"."intervention_type" NOT NULL DEFAULT 'OTHER',
  "title" varchar(200) NOT NULL,
  "description" text,
  "frequency" varchar(100),
  "duration" varchar(50),
  "instructions" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "treatment_interventions"
  ADD COLUMN IF NOT EXISTS "frequency" varchar(100),
  ADD COLUMN IF NOT EXISTS "duration" varchar(50),
  ADD COLUMN IF NOT EXISTS "instructions" text,
  ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS "treatment_interventions_plan_idx"
  ON "treatment_interventions" ("treatment_plan_id", "is_active");

CREATE INDEX IF NOT EXISTS "treatment_interventions_patient_idx"
  ON "treatment_interventions" ("tenant_id", "patient_id");
