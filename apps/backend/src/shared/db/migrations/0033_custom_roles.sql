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
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "custom_roles_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE cascade ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "custom_roles_tenant_id_idx" ON "custom_roles" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "custom_roles_tenant_name_uidx" ON "custom_roles" ("tenant_id", "name");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "custom_role_id" uuid;
ALTER TABLE "staff_invitations" ADD COLUMN IF NOT EXISTS "custom_role_id" uuid;

DO $$ BEGIN
  ALTER TABLE "users"
    ADD CONSTRAINT "users_custom_role_id_custom_roles_id_fk"
    FOREIGN KEY ("custom_role_id") REFERENCES "public"."custom_roles"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "staff_invitations"
    ADD CONSTRAINT "staff_invitations_custom_role_id_custom_roles_id_fk"
    FOREIGN KEY ("custom_role_id") REFERENCES "public"."custom_roles"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
