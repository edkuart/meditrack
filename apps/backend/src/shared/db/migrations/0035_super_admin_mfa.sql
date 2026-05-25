ALTER TABLE users
  ADD COLUMN IF NOT EXISTS two_fa_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS two_fa_confirmed_at timestamp with time zone;
