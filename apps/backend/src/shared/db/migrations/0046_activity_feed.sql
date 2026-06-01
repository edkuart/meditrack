-- Migration 0046: Activity feed for doctor notifications
-- Makes doctor_notifications more flexible: removes referral_id NOT NULL constraint,
-- converts type from enum to varchar (new types: DOCUMENT_UPLOADED, LAB_RESULT_READY),
-- adds metadata jsonb for structured payload.

-- 1. Make referral_id nullable (notifications can now be non-referral)
ALTER TABLE "doctor_notifications" ALTER COLUMN "referral_id" DROP NOT NULL;

-- 2. Convert type column from enum to varchar so we can add new types freely
ALTER TABLE "doctor_notifications" ALTER COLUMN "type" TYPE varchar(50) USING "type"::text;

-- 3. Drop the old enum (no longer needed)
DROP TYPE IF EXISTS "doctor_notif_type";

-- 4. Add optional metadata column for structured event data
ALTER TABLE "doctor_notifications" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
