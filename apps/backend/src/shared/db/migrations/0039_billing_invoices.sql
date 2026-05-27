CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid', 'overdue', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."invoice_provider" AS ENUM('recurrente', 'stripe', 'manual');--> statement-breakpoint

CREATE TABLE "billing_invoice_counters" (
  "year" integer NOT NULL,
  "next_number" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "billing_invoice_counters_pkey" PRIMARY KEY("year")
);--> statement-breakpoint

CREATE TABLE "billing_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "invoice_number" varchar(30) NOT NULL,
  "status" "invoice_status" DEFAULT 'pending' NOT NULL,
  "plan_type" varchar(50) NOT NULL,
  "amount_gtq" numeric(10, 2) NOT NULL,
  "currency" varchar(3) DEFAULT 'GTQ' NOT NULL,
  "provider" "invoice_provider" NOT NULL,
  "provider_checkout_id" varchar(255),
  "provider_payment_id" varchar(255),
  "period_start" timestamp with time zone,
  "period_end" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "notes" text,
  "metadata" jsonb DEFAULT '{}' NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "billing_invoices_invoice_number_unique" UNIQUE("invoice_number")
);--> statement-breakpoint

ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint

CREATE INDEX "billing_invoices_tenant_id_idx" ON "billing_invoices" ("tenant_id");--> statement-breakpoint
CREATE INDEX "billing_invoices_status_idx" ON "billing_invoices" ("status");--> statement-breakpoint
CREATE INDEX "billing_invoices_provider_checkout_id_idx" ON "billing_invoices" ("provider_checkout_id");
