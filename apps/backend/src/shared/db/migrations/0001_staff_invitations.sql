-- Staff invitations table for multi-doctor clinic management
CREATE TABLE IF NOT EXISTS staff_invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         VARCHAR(254) NOT NULL,
  role          user_role NOT NULL DEFAULT 'DOCTOR',
  token_hash    TEXT UNIQUE NOT NULL,
  invited_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS staff_invitations_tenant_id_idx ON staff_invitations(tenant_id);
