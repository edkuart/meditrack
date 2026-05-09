-- Fase 17: audit AI assist usage without storing generated drafts separately.

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'AI_ASSIST_USED';
