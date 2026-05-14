ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'CHECK_IN_SUBMITTED';--> statement-breakpoint
CREATE TYPE "public"."check_in_severity" AS ENUM('OK', 'WATCH', 'ALERT');--> statement-breakpoint
CREATE TABLE "patient_check_ins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "patient_id" uuid NOT NULL,
  "check_in_date" date NOT NULL,
  "pain_score" integer,
  "temperature_c" real,
  "symptoms" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "red_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "medication_issue" boolean DEFAULT false NOT NULL,
  "mood" text,
  "notes" text,
  "severity" "check_in_severity" DEFAULT 'OK' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD CONSTRAINT "patient_check_ins_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD CONSTRAINT "patient_check_ins_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "patient_check_ins_patient_date_uidx" ON "patient_check_ins" USING btree ("patient_id","check_in_date");--> statement-breakpoint
CREATE INDEX "patient_check_ins_tenant_patient_date_idx" ON "patient_check_ins" USING btree ("tenant_id","patient_id","check_in_date");--> statement-breakpoint
CREATE INDEX "patient_check_ins_severity_idx" ON "patient_check_ins" USING btree ("tenant_id","severity","created_at");
