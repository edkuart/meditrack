-- Migration: doctor verification fields
-- Adds colegiado_number, DPI document key, and rejection tracking to users table.
-- is_verified now defaults to false — admins must explicitly approve each doctor.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS colegiado_number varchar(50),
  ADD COLUMN IF NOT EXISTS dpi_document_key text,
  ADD COLUMN IF NOT EXISTS verification_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_rejected_reason text;

-- Existing doctors (created before this migration) stay verified so live accounts aren't broken.
-- New registrations will land with is_verified = false (enforced in application layer).
