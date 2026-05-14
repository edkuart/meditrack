-- ─── POMR / Método de Weed — Historia Clínica Estructurada ───────────────────
-- Agrega campos SOAP a encounters, tabla de signos vitales,
-- lista de problemas (Weed) y antecedentes estructurados del paciente.

-- 1. Campos SOAP en encounters
ALTER TABLE "encounters"
  ADD COLUMN "subjective"  text,
  ADD COLUMN "objective"   text,
  ADD COLUMN "assessment"  text,
  ADD COLUMN "plan"        text;

-- 2. Enums nuevos
CREATE TYPE "public"."problem_status" AS ENUM('ACTIVE', 'INACTIVE', 'RESOLVED', 'CHRONIC');

CREATE TYPE "public"."background_category" AS ENUM(
  'AHF',
  'APP',
  'APNP',
  'AQ',
  'ATRAUMA',
  'ALERGIAS',
  'GINECO_OBS',
  'MEDICAMENTOS',
  'PERINATAL'
);

-- 3. Tabla signos vitales (uno o más registros por encuentro)
CREATE TABLE "vital_signs" (
  "id"                        uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"                 uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "patient_id"                uuid NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT,
  "encounter_id"              uuid NOT NULL REFERENCES "encounters"("id") ON DELETE RESTRICT,
  "blood_pressure_systolic"   integer,
  "blood_pressure_diastolic"  integer,
  "heart_rate"                integer,
  "respiratory_rate"          integer,
  "temperature_celsius"       numeric(4, 1),
  "weight_kg"                 numeric(5, 2),
  "height_cm"                 numeric(5, 1),
  "oxygen_saturation"         integer,
  "glucose_mg_dl"             integer,
  "recorded_by"               uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "recorded_at"               timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"                timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "vital_signs_encounter_id_idx" ON "vital_signs" ("encounter_id");
CREATE INDEX "vital_signs_patient_id_idx"   ON "vital_signs" ("tenant_id", "patient_id");

-- 4. Lista de problemas del paciente (lista numerada de Weed)
CREATE TABLE "patient_problems" (
  "id"                          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"                   uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "patient_id"                  uuid NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT,
  "problem_number"              integer NOT NULL,
  "title"                       varchar(200) NOT NULL,
  "description"                 text,
  "icd10_code"                  varchar(10),
  "icd10_description"           varchar(255),
  "status"                      "problem_status" NOT NULL DEFAULT 'ACTIVE',
  "onset_date"                  date,
  "resolved_date"               date,
  "notes"                       text,
  "identified_in_encounter_id"  uuid REFERENCES "encounters"("id") ON DELETE SET NULL,
  "created_by"                  uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                  timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "patient_problems_patient_id_idx" ON "patient_problems" ("tenant_id", "patient_id");
CREATE INDEX "patient_problems_status_idx"     ON "patient_problems" ("patient_id", "status");

-- 5. Antecedentes del paciente (AHF, APP, APNP, AQ, etc.)
--    is_current=false en registros anteriores preserva historial de cambios
CREATE TABLE "patient_background" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "patient_id"  uuid NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT,
  "category"    "background_category" NOT NULL,
  "content"     text NOT NULL,
  "is_current"  boolean NOT NULL DEFAULT true,
  "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "recorded_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"  timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "patient_background_patient_id_idx" ON "patient_background" ("tenant_id", "patient_id");
CREATE INDEX "patient_background_current_idx"    ON "patient_background" ("patient_id", "category", "is_current");
