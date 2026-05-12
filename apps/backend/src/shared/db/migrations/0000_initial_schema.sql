CREATE TYPE "public"."plan_type" AS ENUM('free', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'suspended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('SUPER_ADMIN', 'ADMIN_CLINIC', 'DOCTOR', 'NURSE', 'ASSISTANT');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."access_channel" AS ENUM('magic_link', 'qr', 'pin', 'whatsapp');--> statement-breakpoint
CREATE TYPE "public"."encounter_status" AS ENUM('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."encounter_type" AS ENUM('CONSULTATION', 'FOLLOW_UP', 'POST_HOSPITALIZATION', 'DISCHARGE', 'CHRONIC_CONTROL', 'EMERGENCY');--> statement-breakpoint
CREATE TYPE "public"."dose_status" AS ENUM('PENDING', 'CONFIRMED', 'MISSED', 'SKIPPED', 'CANCELLED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."frequency_type" AS ENUM('DAILY', 'EVERY_X_HOURS', 'WEEKLY', 'AS_NEEDED');--> statement-breakpoint
CREATE TYPE "public"."treatment_status" AS ENUM('DRAFT', 'ACTIVE', 'COMPLETED', 'SUSPENDED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('PRESCRIPTION', 'LAB_RESULT', 'IMAGING', 'CONSENT', 'CLINICAL_NOTE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'TOKEN_REFRESH', 'PASSWORD_CHANGED', 'PATIENT_CREATED', 'PATIENT_UPDATED', 'PATIENT_VIEWED', 'PATIENT_SEARCHED', 'PATIENT_ACCESSED', 'ENCOUNTER_OPENED', 'ENCOUNTER_NOTES_SAVED', 'ENCOUNTER_CLOSED', 'ENCOUNTER_ARCHIVED', 'TREATMENT_CREATED', 'TREATMENT_ACTIVATED', 'TREATMENT_SUSPENDED', 'TREATMENT_MODIFIED', 'DOSE_CONFIRMED', 'DOSE_MARKED_MISSED', 'DOSE_SKIPPED', 'DOSE_EDIT_WINDOW_EXPIRED', 'DOCUMENT_UPLOADED', 'DOCUMENT_VIEWED', 'DOCUMENT_DELETED', 'TOKEN_GENERATED', 'TOKEN_USED', 'TOKEN_EXPIRED', 'TOKEN_REVOKED', 'USER_INVITED', 'USER_DEACTIVATED', 'SETTINGS_CHANGED', 'EXPORT_REQUESTED', 'AI_ASSIST_USED', 'BILLING_CHECKOUT_STARTED', 'BILLING_PLAN_CHANGED', 'CONSENT_RECORDED', 'CONSENT_WITHDRAWN', 'PATIENT_ANONYMIZED', 'DATA_EXPORT_REQUESTED', 'TOS_ACCEPTED', 'PRIVACY_POLICY_ACCEPTED', 'DATA_RETENTION_PURGE');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('USER', 'PATIENT', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'sms', 'whatsapp', 'push');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('DOSE_REMINDER', 'DOSE_MISSED', 'TREATMENT_STARTING', 'TREATMENT_ENDING', 'APPOINTMENT', 'WELCOME', 'MAGIC_LINK');--> statement-breakpoint
CREATE TYPE "public"."consent_type" AS ENUM('data_processing', 'treatment', 'third_party_sharing', 'research', 'marketing');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"plan_type" "plan_type" DEFAULT 'free' NOT NULL,
	"status" "tenant_status" DEFAULT 'active' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"subscription_current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'DOCTOR' NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"professional_id" varchar(50),
	"specialty" varchar(100),
	"is_verified" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"two_fa_enabled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"tos_accepted_at" timestamp with time zone,
	"privacy_policy_accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"date_of_birth" date,
	"sex" "sex",
	"phone" varchar(30),
	"email" varchar(254),
	"id_number" varchar(30),
	"access_pin_hash" text,
	"emergency_contact" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"anonymized_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"channel" "access_channel" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "encounters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"doctor_id" uuid NOT NULL,
	"encounter_type" "encounter_type" DEFAULT 'CONSULTATION' NOT NULL,
	"status" "encounter_status" DEFAULT 'OPEN' NOT NULL,
	"chief_complaint" varchar(500),
	"notes" text,
	"summary" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dose_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medication_item_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "dose_status" DEFAULT 'PENDING' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmation_channel" varchar(30),
	"notes" text,
	"can_edit_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"treatment_plan_id" uuid NOT NULL,
	"drug_name" varchar(200) NOT NULL,
	"presentation" varchar(100),
	"concentration" varchar(50),
	"dose_amount" real NOT NULL,
	"dose_unit" varchar(30) NOT NULL,
	"route" varchar(50),
	"frequency_type" "frequency_type" NOT NULL,
	"frequency_value" integer,
	"times_per_day" jsonb,
	"duration_days" integer,
	"special_instructions" text,
	"with_food" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"encounter_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"status" "treatment_status" DEFAULT 'DRAFT' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"instructions" text,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"encounter_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"type" "document_type" DEFAULT 'OTHER' NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" bigint NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"storage_key" text NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"is_visible_to_patient" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_email" varchar(254),
	"action" "audit_action" NOT NULL,
	"resource_type" varchar(50) NOT NULL,
	"resource_id" uuid,
	"ip_address" text,
	"user_agent" text,
	"changes" jsonb,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"dose_event_id" uuid,
	"channel" "notification_channel" NOT NULL,
	"type" "notification_type" NOT NULL,
	"status" "notification_status" DEFAULT 'QUEUED' NOT NULL,
	"recipient" varchar(254) NOT NULL,
	"provider_message_id" varchar(200),
	"content_snapshot" jsonb,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_retry_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"failed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_hint" varchar(200),
	"is_revoked" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "staff_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(254) NOT NULL,
	"role" "user_role" DEFAULT 'DOCTOR' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "clinical_protocols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"name" varchar(200) NOT NULL,
	"category" varchar(80) DEFAULT 'GENERAL' NOT NULL,
	"description" text,
	"encounter_type" "encounter_type",
	"note_template" text,
	"summary_template" text,
	"treatment_name" varchar(200),
	"treatment_instructions" text,
	"medications" jsonb NOT NULL,
	"follow_up_days" integer,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"consent_type" "consent_type" NOT NULL,
	"description" text,
	"recorded_by" uuid,
	"recorded_by_email" varchar(254),
	"consented_at" timestamp with time zone NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_by" uuid,
	"ip_address" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_access_tokens" ADD CONSTRAINT "patient_access_tokens_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_access_tokens" ADD CONSTRAINT "patient_access_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_events" ADD CONSTRAINT "dose_events_medication_item_id_medication_items_id_fk" FOREIGN KEY ("medication_item_id") REFERENCES "public"."medication_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dose_events" ADD CONSTRAINT "dose_events_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_items" ADD CONSTRAINT "medication_items_treatment_plan_id_treatment_plans_id_fk" FOREIGN KEY ("treatment_plan_id") REFERENCES "public"."treatment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_encounter_id_encounters_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_encounter_id_encounters_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_dose_event_id_dose_events_id_fk" FOREIGN KEY ("dose_event_id") REFERENCES "public"."dose_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_protocols" ADD CONSTRAINT "clinical_protocols_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_consents" ADD CONSTRAINT "patient_consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_consents" ADD CONSTRAINT "patient_consents_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_consents" ADD CONSTRAINT "patient_consents_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_consents" ADD CONSTRAINT "patient_consents_withdrawn_by_users_id_fk" FOREIGN KEY ("withdrawn_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patients_tenant_id_idx" ON "patients" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "patients_id_number_idx" ON "patients" USING btree ("tenant_id","id_number");--> statement-breakpoint
CREATE INDEX "patients_name_idx" ON "patients" USING btree ("tenant_id","last_name","first_name");--> statement-breakpoint
CREATE INDEX "patients_tenant_active_created_idx" ON "patients" USING btree ("tenant_id","is_active","created_at");--> statement-breakpoint
CREATE INDEX "pat_patient_id_idx" ON "patient_access_tokens" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "pat_token_hash_idx" ON "patient_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "encounters_tenant_id_idx" ON "encounters" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "encounters_patient_id_idx" ON "encounters" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "encounters_doctor_id_idx" ON "encounters" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "encounters_opened_at_idx" ON "encounters" USING btree ("tenant_id","opened_at");--> statement-breakpoint
CREATE INDEX "dose_events_patient_id_idx" ON "dose_events" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "dose_events_scheduled_at_idx" ON "dose_events" USING btree ("patient_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "dose_events_status_idx" ON "dose_events" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "dose_events_patient_status_scheduled_idx" ON "dose_events" USING btree ("patient_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "dose_events_medication_status_scheduled_idx" ON "dose_events" USING btree ("medication_item_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "medication_items_plan_active_idx" ON "medication_items" USING btree ("treatment_plan_id","is_active");--> statement-breakpoint
CREATE INDEX "treatment_plans_patient_id_idx" ON "treatment_plans" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "treatment_plans_tenant_id_idx" ON "treatment_plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "treatment_plans_tenant_patient_status_idx" ON "treatment_plans" USING btree ("tenant_id","patient_id","status");--> statement-breakpoint
CREATE INDEX "treatment_plans_tenant_encounter_idx" ON "treatment_plans" USING btree ("tenant_id","encounter_id");--> statement-breakpoint
CREATE INDEX "documents_patient_id_idx" ON "documents" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "documents_tenant_id_idx" ON "documents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "documents_encounter_id_idx" ON "documents" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "notif_patient_id_idx" ON "notification_logs" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "notif_dose_event_id_idx" ON "notification_logs" USING btree ("dose_event_id");--> statement-breakpoint
CREATE INDEX "notif_status_idx" ON "notification_logs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "notif_retry_idx" ON "notification_logs" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_hash_idx" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "staff_invitations_tenant_id_idx" ON "staff_invitations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "clinical_protocols_tenant_active_idx" ON "clinical_protocols" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "clinical_protocols_tenant_category_idx" ON "clinical_protocols" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE INDEX "patient_consents_patient_id_idx" ON "patient_consents" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "patient_consents_tenant_id_idx" ON "patient_consents" USING btree ("tenant_id","created_at");