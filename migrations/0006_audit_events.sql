BEGIN;

CREATE TABLE IF NOT EXISTS audit_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL,
  status text NOT NULL,
  domain text NOT NULL,
  route text NOT NULL,
  method text NOT NULL,
  user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  target_id varchar,
  request_id text,
  ip_hash text,
  user_agent text,
  details jsonb,
  error text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_audit_events_action_domain') THEN
    ALTER TABLE audit_events
      ADD CONSTRAINT ck_audit_events_action_domain
      CHECK (action IN ('create', 'update', 'delete', 'payment', 'auth', 'import'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_audit_events_status_domain') THEN
    ALTER TABLE audit_events
      ADD CONSTRAINT ck_audit_events_status_domain
      CHECK (status IN ('success', 'failure', 'error'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_user_id_created_at ON audit_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_domain_created_at ON audit_events(domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_status_created_at ON audit_events(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_target_id_created_at ON audit_events(target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_request_id ON audit_events(request_id);

COMMIT;
