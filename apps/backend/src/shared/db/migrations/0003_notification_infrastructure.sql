-- Phase 13: notification delivery tracking and retry support.

ALTER TABLE notification_logs
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS notif_retry_idx
  ON notification_logs(status, next_retry_at);

CREATE INDEX IF NOT EXISTS notif_dose_type_status_idx
  ON notification_logs(dose_event_id, type, status, created_at DESC);
