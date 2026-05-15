-- Keep older deployed databases compatible with the current laboratory schema.
ALTER TYPE "public"."lab_result_status" ADD VALUE IF NOT EXISTS 'CRITICAL_HIGH';
ALTER TYPE "public"."lab_result_status" ADD VALUE IF NOT EXISTS 'CRITICAL_LOW';

ALTER TABLE "lab_orders"
  ADD COLUMN IF NOT EXISTS "ordered_at" timestamp with time zone DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "lab_results"
  ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS "lab_orders_patient_idx" ON "lab_orders" ("tenant_id", "patient_id");
CREATE INDEX IF NOT EXISTS "lab_orders_ordered_at_idx" ON "lab_orders" ("tenant_id", "ordered_at");
CREATE INDEX IF NOT EXISTS "lab_results_order_idx" ON "lab_results" ("order_id");
