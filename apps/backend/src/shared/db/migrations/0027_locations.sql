-- Migration: locations / multi-sede support

CREATE TABLE IF NOT EXISTS locations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        varchar(200) NOT NULL,
  address     text,
  phone       varchar(30),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS locations_tenant_idx ON locations(tenant_id);

ALTER TABLE departments ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS departments_location_idx ON departments(location_id);
