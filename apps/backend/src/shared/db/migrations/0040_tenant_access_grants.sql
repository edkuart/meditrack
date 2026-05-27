CREATE TYPE "public"."tenant_access_grant_type" AS ENUM('trial', 'promo', 'manual_override', 'internal_demo');--> statement-breakpoint
CREATE TYPE "public"."tenant_access_grant_status" AS ENUM('active', 'expired', 'revoked');--> statement-breakpoint

CREATE TABLE "tenant_access_grants" (
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
);--> statement-breakpoint

ALTER TABLE "tenant_access_grants" ADD CONSTRAINT "tenant_access_grants_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "tenant_access_grants" ADD CONSTRAINT "tenant_access_grants_granted_by_fkey"
  FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint
ALTER TABLE "tenant_access_grants" ADD CONSTRAINT "tenant_access_grants_revoked_by_fkey"
  FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;--> statement-breakpoint

CREATE INDEX "tenant_access_grants_tenant_status_idx" ON "tenant_access_grants" ("tenant_id", "status", "ends_at");--> statement-breakpoint
CREATE INDEX "tenant_access_grants_granted_by_idx" ON "tenant_access_grants" ("granted_by");
