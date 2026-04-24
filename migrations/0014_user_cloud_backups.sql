BEGIN;

CREATE TABLE IF NOT EXISTS user_cloud_backups (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,
  backup_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'completed',
  is_encrypted boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_cloud_backups_user_id
  ON user_cloud_backups (user_id);

CREATE INDEX IF NOT EXISTS idx_user_cloud_backups_created_at
  ON user_cloud_backups (created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_user_cloud_backups_backup_type'
      AND conrelid = 'user_cloud_backups'::regclass
  ) THEN
    ALTER TABLE user_cloud_backups
      ADD CONSTRAINT chk_user_cloud_backups_backup_type
      CHECK (backup_type IN ('manual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_user_cloud_backups_status'
      AND conrelid = 'user_cloud_backups'::regclass
  ) THEN
    ALTER TABLE user_cloud_backups
      ADD CONSTRAINT chk_user_cloud_backups_status
      CHECK (status IN ('completed', 'failed'));
  END IF;
END;
$$;

COMMIT;
