-- ─── Non-pharmacological treatment interventions ──────────────────────────────

CREATE TYPE "public"."intervention_type" AS ENUM('EXERCISE', 'DIET', 'THERAPY', 'MONITORING', 'OTHER');

CREATE TABLE "treatment_interventions" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"         uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "treatment_plan_id" uuid NOT NULL REFERENCES "treatment_plans"("id") ON DELETE CASCADE,
  "patient_id"        uuid NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT,
  "type"              "intervention_type" NOT NULL DEFAULT 'OTHER',
  "title"             varchar(200) NOT NULL,
  "description"       text,
  "frequency"         varchar(100),
  "duration"          varchar(50),
  "instructions"      text,
  "sort_order"        integer NOT NULL DEFAULT 0,
  "is_active"         boolean NOT NULL DEFAULT true,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "treatment_interventions_plan_idx"    ON "treatment_interventions" ("treatment_plan_id", "is_active");
CREATE INDEX "treatment_interventions_patient_idx" ON "treatment_interventions" ("tenant_id", "patient_id");
