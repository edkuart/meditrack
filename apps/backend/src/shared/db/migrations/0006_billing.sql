-- Fase 18: Add Stripe billing columns to tenants.
-- plan_type enum already exists (free/pro/enterprise).

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_stripe_customer_id_idx
  ON tenants(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
