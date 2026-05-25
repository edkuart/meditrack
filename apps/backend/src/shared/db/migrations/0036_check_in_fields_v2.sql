DO $$ BEGIN
  CREATE TYPE "public"."check_in_severity" AS ENUM('OK', 'WATCH', 'ALERT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_check_ins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action,
  "patient_id" uuid NOT NULL REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action,
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
CREATE UNIQUE INDEX IF NOT EXISTS "patient_check_ins_patient_date_uidx" ON "patient_check_ins" USING btree ("patient_id","check_in_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patient_check_ins_tenant_patient_date_idx" ON "patient_check_ins" USING btree ("tenant_id","patient_id","check_in_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patient_check_ins_severity_idx" ON "patient_check_ins" USING btree ("tenant_id","severity","created_at");--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN IF NOT EXISTS "side_effects" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN IF NOT EXISTS "adherence_self_report" text;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN IF NOT EXISTS "adherence_skip_reason" text;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN IF NOT EXISTS "energy_level" text;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN IF NOT EXISTS "sleep_quality" text;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN IF NOT EXISTS "treatment_perception" text;
