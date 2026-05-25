ALTER TABLE "patient_check_ins" ADD COLUMN "side_effects" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN "adherence_self_report" text;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN "adherence_skip_reason" text;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN "energy_level" text;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN "sleep_quality" text;--> statement-breakpoint
ALTER TABLE "patient_check_ins" ADD COLUMN "treatment_perception" text;
