-- Migration 0047: Web Push notification subscriptions
-- Stores browser push subscriptions per doctor user.

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id"         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tenant_id"  uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "endpoint"   text NOT NULL,
  "p256dh"     text NOT NULL,
  "auth"       text NOT NULL,
  "user_agent" varchar(300),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "last_used_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE ("user_id", "endpoint")
);

CREATE INDEX IF NOT EXISTS "push_sub_user_idx" ON "push_subscriptions"("user_id");
