BEGIN;

CREATE TABLE IF NOT EXISTS user_icon_library (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  image_url text NOT NULL,
  storage_path text,
  category text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_icon_library_user_id
  ON user_icon_library(user_id);

CREATE INDEX IF NOT EXISTS idx_user_icon_library_created_at
  ON user_icon_library(created_at);

CREATE INDEX IF NOT EXISTS idx_user_icon_library_updated_at
  ON user_icon_library(updated_at);

COMMIT;
