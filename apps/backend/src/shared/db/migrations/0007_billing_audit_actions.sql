-- Fase 19: Add billing audit actions to the audit_action enum.
-- PostgreSQL requires ALTER TYPE ... ADD VALUE (cannot be run inside a transaction).

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'BILLING_CHECKOUT_STARTED';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'BILLING_PLAN_CHANGED';
