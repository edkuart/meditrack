DO $$ BEGIN CREATE TYPE "public"."platform_ticket_source" AS ENUM('LOGIN_HELP', 'AUTHENTICATED_PROFILE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."platform_ticket_status" AS ENUM('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."lab_external_status" AS ENUM('RECEIVED', 'AI_EXTRACTING', 'DRAFT_READY', 'VALIDATED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."lab_extracted_value_status" AS ENUM('AI_DRAFT', 'ACCEPTED', 'EDITED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."invoice_provider" AS ENUM('recurrente', 'stripe', 'manual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid', 'overdue', 'cancelled', 'refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."tenant_access_grant_type" AS ENUM('trial', 'promo', 'manual_override', 'internal_demo'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TYPE "public"."tenant_access_grant_status" ADD VALUE IF NOT EXISTS 'converted';--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."appointment_status" AS ENUM('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."appointment_type" AS ENUM('CONSULTATION', 'FOLLOW_UP', 'PROCEDURE', 'CHECK_UP', 'EMERGENCY', 'TELECONSULT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TYPE "public"."plan_type" ADD VALUE IF NOT EXISTS 'doctor_individual' BEFORE 'pro';--> statement-breakpoint
ALTER TYPE "public"."plan_type" ADD VALUE IF NOT EXISTS 'clinic_complete' BEFORE 'pro';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'BILLING_INVOICE_PAID_MANUAL' BEFORE 'CONSENT_RECORDED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'BILLING_INVOICE_CANCELLED' BEFORE 'CONSENT_RECORDED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'LAB_EXTERNAL_SUBMITTED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'LAB_EXTERNAL_AI_EXTRACTED';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE IF NOT EXISTS 'LAB_EXTERNAL_VALIDATED';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"base_role" "user_role" DEFAULT 'DOCTOR' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_password_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"user_id" uuid,
	"requester_email" varchar(254) NOT NULL,
	"requester_name" varchar(220),
	"source" "platform_ticket_source" DEFAULT 'LOGIN_HELP' NOT NULL,
	"status" "platform_ticket_status" DEFAULT 'OPEN' NOT NULL,
	"message" text,
	"admin_notes" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lab_external_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid,
	"patient_id" uuid NOT NULL,
	"status" "lab_external_status" DEFAULT 'RECEIVED' NOT NULL,
	"patient_notes" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"ai_started_at" timestamp with time zone,
	"ai_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lab_extracted_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"panel_name" varchar(200) NOT NULL,
	"parameter_name" varchar(200) NOT NULL,
	"raw_value" varchar(100),
	"numeric_value" numeric(12, 4),
	"unit" varchar(50),
	"ref_min" numeric(12, 4),
	"ref_max" numeric(12, 4),
	"ref_text" varchar(100),
	"confidence" numeric(3, 2) DEFAULT '0' NOT NULL,
	"raw_text" varchar(500),
	"ai_flag" varchar(10),
	"status" "lab_extracted_value_status" DEFAULT 'AI_DRAFT' NOT NULL,
	"doctor_value" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lab_submission_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_invoice_counters" (
	"year" integer NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "billing_invoice_counters_year_pk" PRIMARY KEY("year")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_invoices" (
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
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"grant_type" "tenant_access_grant_type" DEFAULT 'trial' NOT NULL,
	"plan_type" "plan_type" NOT NULL,
	"status" "tenant_access_grant_status" DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" varchar(500) NOT NULL,
	"notes" text,
	"max_ai_units_monthly" integer,
	"max_organizations" integer,
	"max_staff" integer,
	"max_patients" integer,
	"granted_by" uuid,
	"revoked_by" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"location_id" uuid,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"type" "appointment_type" DEFAULT 'CONSULTATION' NOT NULL,
	"status" "appointment_status" DEFAULT 'SCHEDULED' NOT NULL,
	"reason" text,
	"notes" text,
	"cancelled_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "custom_role_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_fa_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "two_fa_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD COLUMN IF NOT EXISTS "custom_role_id" uuid;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN IF NOT EXISTS "side_effects" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN IF NOT EXISTS "adherence_self_report" text;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN IF NOT EXISTS "adherence_skip_reason" text;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN IF NOT EXISTS "energy_level" text;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN IF NOT EXISTS "sleep_quality" text;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN IF NOT EXISTS "treatment_perception" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "formatted_address" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "google_place_id" varchar(255);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "latitude" real;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "longitude" real;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "maps_url" text;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "custom_roles" ADD CONSTRAINT "custom_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "platform_password_tickets" ADD CONSTRAINT "platform_password_tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "platform_password_tickets" ADD CONSTRAINT "platform_password_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "platform_password_tickets" ADD CONSTRAINT "platform_password_tickets_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "lab_external_submissions" ADD CONSTRAINT "lab_external_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "lab_external_submissions" ADD CONSTRAINT "lab_external_submissions_order_id_lab_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."lab_orders"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "lab_external_submissions" ADD CONSTRAINT "lab_external_submissions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "lab_external_submissions" ADD CONSTRAINT "lab_external_submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "lab_extracted_values" ADD CONSTRAINT "lab_extracted_values_submission_id_lab_external_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."lab_external_submissions"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "lab_extracted_values" ADD CONSTRAINT "lab_extracted_values_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "lab_submission_files" ADD CONSTRAINT "lab_submission_files_submission_id_lab_external_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."lab_external_submissions"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "lab_submission_files" ADD CONSTRAINT "lab_submission_files_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "lab_submission_files" ADD CONSTRAINT "lab_submission_files_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tenant_access_grants" ADD CONSTRAINT "tenant_access_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tenant_access_grants" ADD CONSTRAINT "tenant_access_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tenant_access_grants" ADD CONSTRAINT "tenant_access_grants_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "appointments" ADD CONSTRAINT "appointments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_roles_tenant_id_idx" ON "custom_roles" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "custom_roles_tenant_name_uidx" ON "custom_roles" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ppt_status_idx" ON "platform_password_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ppt_user_idx" ON "platform_password_tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ppt_tenant_idx" ON "platform_password_tickets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ppt_created_at_idx" ON "platform_password_tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_ext_sub_tenant_idx" ON "lab_external_submissions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_ext_sub_patient_idx" ON "lab_external_submissions" USING btree ("tenant_id","patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_ext_sub_order_idx" ON "lab_external_submissions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_ext_sub_status_idx" ON "lab_external_submissions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_extracted_submission_idx" ON "lab_extracted_values" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lab_sub_files_submission_idx" ON "lab_submission_files" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_access_grants_tenant_status_idx" ON "tenant_access_grants" USING btree ("tenant_id","status","ends_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_access_grants_granted_by_idx" ON "tenant_access_grants" USING btree ("granted_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_tenant_idx" ON "appointments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_patient_idx" ON "appointments" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_doctor_idx" ON "appointments" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_scheduled_at_idx" ON "appointments" USING btree ("tenant_id","scheduled_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_status_idx" ON "appointments" USING btree ("tenant_id","status");