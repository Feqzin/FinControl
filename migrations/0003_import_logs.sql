BEGIN;

CREATE TABLE IF NOT EXISTS import_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cartao_id varchar NOT NULL REFERENCES cartoes(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_name text,
  status text NOT NULL DEFAULT 'previewed',
  request_payload text NOT NULL,
  preview_payload text NOT NULL,
  confirmed_payload text,
  created_compra_ids text,
  rollback_payload text,
  total_items integer NOT NULL DEFAULT 0,
  imported_items integer NOT NULL DEFAULT 0,
  skipped_items integer NOT NULL DEFAULT 0,
  average_confidence numeric(5, 2),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  rolled_back_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_import_logs_user_id ON import_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_cartao_id ON import_logs(cartao_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_status ON import_logs(status);
CREATE INDEX IF NOT EXISTS idx_import_logs_created_at ON import_logs(created_at);

COMMIT;
