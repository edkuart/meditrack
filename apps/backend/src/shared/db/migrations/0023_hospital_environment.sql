-- Migration: hospital environment
-- Adds tenant type (CLINIC vs HOSPITAL), hospital-specific user roles,
-- departments table, and department membership.

-- New enum values
CREATE TYPE tenant_type AS ENUM ('CLINIC', 'HOSPITAL');
CREATE TYPE department_type AS ENUM (
  'GENERAL', 'LAB', 'RADIOLOGY', 'PHARMACY', 'EMERGENCY',
  'ICU', 'SURGERY', 'PEDIATRICS', 'OBSTETRICS', 'CARDIOLOGY',
  'NEUROLOGY', 'ONCOLOGY', 'ORTHOPEDICS', 'PSYCHIATRY', 'OTHER'
);

-- Extend user_role enum with hospital-specific roles
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'LAB_TECHNICIAN';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'RADIOLOGIST';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'PHARMACIST';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'RECEPTIONIST';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'WARD_NURSE';

-- Add type column to tenants (default CLINIC so existing tenants are unaffected)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS type tenant_type NOT NULL DEFAULT 'CLINIC';

-- Departments (belong to a hospital tenant)
CREATE TABLE IF NOT EXISTS departments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          varchar(200) NOT NULL,
  type          department_type NOT NULL DEFAULT 'GENERAL',
  head_doctor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS departments_tenant_idx ON departments(tenant_id);

-- Department membership (user ↔ department many-to-many)
CREATE TABLE IF NOT EXISTS department_members (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, department_id)
);

CREATE INDEX IF NOT EXISTS dept_members_user_idx ON department_members(user_id);
CREATE INDEX IF NOT EXISTS dept_members_dept_idx ON department_members(department_id);

-- Allow staff invitations to include a target department (hospital tenants)
ALTER TABLE staff_invitations
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id) ON DELETE SET NULL;
