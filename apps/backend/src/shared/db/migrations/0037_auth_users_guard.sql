ALTER TABLE users
  ADD COLUMN IF NOT EXISTS custom_role_id uuid,
  ADD COLUMN IF NOT EXISTS professional_id varchar(64),
  ADD COLUMN IF NOT EXISTS colegiado_number varchar(64),
  ADD COLUMN IF NOT EXISTS specialty varchar(100),
  ADD COLUMN IF NOT EXISTS dpi_document_key text,
  ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS verification_rejected_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS verification_rejected_reason text,
  ADD COLUMN IF NOT EXISTS two_fa_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS two_fa_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS two_fa_confirmed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS tos_accepted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS privacy_policy_accepted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

UPDATE users SET is_verified = false WHERE is_verified IS NULL;
UPDATE users SET is_active = true WHERE is_active IS NULL;
UPDATE users SET two_fa_enabled = false WHERE two_fa_enabled IS NULL;
UPDATE users SET updated_at = now() WHERE updated_at IS NULL;

ALTER TABLE users
  ALTER COLUMN is_verified SET DEFAULT false,
  ALTER COLUMN is_verified SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN two_fa_enabled SET DEFAULT false,
  ALTER COLUMN two_fa_enabled SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;
