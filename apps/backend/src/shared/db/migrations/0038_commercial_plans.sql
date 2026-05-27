-- Add commercial SaaS plan values.
-- Existing legacy values (free/pro/enterprise) remain valid for compatibility.

ALTER TYPE plan_type ADD VALUE IF NOT EXISTS 'doctor_individual';
ALTER TYPE plan_type ADD VALUE IF NOT EXISTS 'clinic_complete';
