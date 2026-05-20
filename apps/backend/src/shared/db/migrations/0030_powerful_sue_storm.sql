CREATE TYPE "public"."doctor_notif_type" AS ENUM('REFERRAL_CREATED', 'REFERRAL_ACCEPTED', 'REFERRAL_REJECTED', 'REFERRAL_COMPLETED', 'REFERRAL_CANCELLED');--> statement-breakpoint
CREATE TABLE "doctor_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"referral_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"type" "doctor_notif_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doctor_notifications" ADD CONSTRAINT "doctor_notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_notifications" ADD CONSTRAINT "doctor_notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_notifications" ADD CONSTRAINT "doctor_notifications_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doctor_notifications" ADD CONSTRAINT "doctor_notifications_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_notif_recipient_idx" ON "doctor_notifications" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "doc_notif_tenant_idx" ON "doctor_notifications" USING btree ("tenant_id","is_read");
