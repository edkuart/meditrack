-- Keep older deployed databases compatible with the current laboratory schema.
-- Some production databases predate the lab module or have a partial lab schema.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'lab_order_status'
  ) THEN
    CREATE TYPE "public"."lab_order_status" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'lab_result_status'
  ) THEN
    CREATE TYPE "public"."lab_result_status" AS ENUM('PENDING', 'NORMAL', 'HIGH', 'LOW', 'CRITICAL_HIGH', 'CRITICAL_LOW');
  END IF;
END $$;

ALTER TYPE "public"."lab_result_status" ADD VALUE IF NOT EXISTS 'CRITICAL_HIGH';
ALTER TYPE "public"."lab_result_status" ADD VALUE IF NOT EXISTS 'CRITICAL_LOW';

CREATE TABLE IF NOT EXISTS "lab_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT,
  "encounter_id" uuid REFERENCES "encounters"("id") ON DELETE SET NULL,
  "ordered_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "status" "public"."lab_order_status" NOT NULL DEFAULT 'PENDING',
  "notes" text,
  "ordered_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "lab_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "lab_orders"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "panel_name" varchar(200) NOT NULL,
  "parameter_name" varchar(200) NOT NULL,
  "value" varchar(100),
  "numeric_value" numeric(12, 4),
  "unit" varchar(50),
  "ref_min" numeric(12, 4),
  "ref_max" numeric(12, 4),
  "ref_text" varchar(100),
  "status" "public"."lab_result_status" NOT NULL DEFAULT 'PENDING',
  "notes" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "lab_orders"
  ADD COLUMN IF NOT EXISTS "ordered_at" timestamp with time zone DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "lab_results"
  ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS "lab_orders_tenant_idx" ON "lab_orders" ("tenant_id");
CREATE INDEX IF NOT EXISTS "lab_orders_patient_idx" ON "lab_orders" ("tenant_id", "patient_id");
CREATE INDEX IF NOT EXISTS "lab_orders_ordered_at_idx" ON "lab_orders" ("tenant_id", "ordered_at");
CREATE INDEX IF NOT EXISTS "lab_results_order_idx" ON "lab_results" ("order_id");
CREATE INDEX IF NOT EXISTS "lab_results_tenant_idx" ON "lab_results" ("tenant_id");

DROP RULE IF EXISTS "no_delete_lab_orders" ON "lab_orders";
CREATE RULE "no_delete_lab_orders" AS ON DELETE TO "lab_orders" DO INSTEAD NOTHING;
