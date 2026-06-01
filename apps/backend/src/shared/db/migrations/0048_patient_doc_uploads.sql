-- Migration 0048: Allow patient-origin document uploads
-- Makes documents.uploaded_by nullable so patients can upload without a staff user reference.

ALTER TABLE "documents" ALTER COLUMN "uploaded_by" DROP NOT NULL;
