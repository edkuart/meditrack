CREATE TYPE platform_ticket_status AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED');
CREATE TYPE platform_ticket_source AS ENUM ('LOGIN_HELP', 'AUTHENTICATED_PROFILE');

CREATE TABLE IF NOT EXISTS platform_password_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  requester_email varchar(254) NOT NULL,
  requester_name varchar(220),
  source platform_ticket_source NOT NULL DEFAULT 'LOGIN_HELP',
  status platform_ticket_status NOT NULL DEFAULT 'OPEN',
  message text,
  admin_notes text,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ppt_status_idx ON platform_password_tickets(status);
CREATE INDEX IF NOT EXISTS ppt_user_idx ON platform_password_tickets(user_id);
CREATE INDEX IF NOT EXISTS ppt_tenant_idx ON platform_password_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS ppt_created_at_idx ON platform_password_tickets(created_at);
