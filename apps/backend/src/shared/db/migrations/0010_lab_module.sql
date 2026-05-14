-- ─── Lab module ────────────────────────────────────────────────────────────────

ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'LAB_ORDER_CREATED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'LAB_ORDER_UPDATED';
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'LAB_RESULTS_ENTERED';

CREATE TYPE "public"."lab_order_status" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "public"."lab_result_status" AS ENUM('PENDING', 'NORMAL', 'HIGH', 'LOW', 'CRITICAL_HIGH', 'CRITICAL_LOW');

CREATE TABLE "lab_orders" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"    uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "patient_id"   uuid NOT NULL REFERENCES "patients"("id") ON DELETE RESTRICT,
  "encounter_id" uuid REFERENCES "encounters"("id") ON DELETE SET NULL,
  "ordered_by"   uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "status"       "lab_order_status" NOT NULL DEFAULT 'PENDING',
  "notes"        text,
  "ordered_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "lab_orders_tenant_idx"      ON "lab_orders" ("tenant_id");
CREATE INDEX "lab_orders_patient_idx"     ON "lab_orders" ("tenant_id", "patient_id");
CREATE INDEX "lab_orders_ordered_at_idx"  ON "lab_orders" ("tenant_id", "ordered_at");

CREATE TABLE "lab_results" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id"        uuid NOT NULL REFERENCES "lab_orders"("id") ON DELETE CASCADE,
  "tenant_id"       uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "panel_name"      varchar(200) NOT NULL,
  "parameter_name"  varchar(200) NOT NULL,
  "value"           varchar(100),
  "numeric_value"   numeric(12, 4),
  "unit"            varchar(50),
  "ref_min"         numeric(12, 4),
  "ref_max"         numeric(12, 4),
  "ref_text"        varchar(100),
  "status"          "lab_result_status" NOT NULL DEFAULT 'PENDING',
  "notes"           text,
  "sort_order"      integer NOT NULL DEFAULT 0,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "lab_results_order_idx"   ON "lab_results" ("order_id");
CREATE INDEX "lab_results_tenant_idx"  ON "lab_results" ("tenant_id");

-- Audit: block DELETE on lab_orders (clinical record integrity)
CREATE RULE "no_delete_lab_orders" AS ON DELETE TO "lab_orders" DO INSTEAD NOTHING;
