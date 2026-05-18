BEGIN;

ALTER TABLE user_icon_library
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS official_icon_id varchar,
  ADD COLUMN IF NOT EXISTS tags jsonb;

CREATE TABLE IF NOT EXISTS official_icon_packs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  cover_image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS official_icon_library (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  icon_key text NOT NULL,
  name text NOT NULL,
  image_url text NOT NULL,
  storage_path text,
  category text,
  tags jsonb,
  aliases jsonb,
  pack_id varchar REFERENCES official_icon_packs(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_user_icon_library_official_icon_id'
      AND table_name = 'user_icon_library'
  ) THEN
    ALTER TABLE user_icon_library
      ADD CONSTRAINT fk_user_icon_library_official_icon_id
      FOREIGN KEY (official_icon_id) REFERENCES official_icon_library(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_icon_library_source_type
  ON user_icon_library(source_type);

CREATE INDEX IF NOT EXISTS idx_user_icon_library_official_icon_id
  ON user_icon_library(official_icon_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_icon_library_user_official_unique
  ON user_icon_library(user_id, official_icon_id)
  WHERE official_icon_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_official_icon_packs_is_active
  ON official_icon_packs(is_active);

CREATE INDEX IF NOT EXISTS idx_official_icon_packs_created_at
  ON official_icon_packs(created_at);

CREATE INDEX IF NOT EXISTS idx_official_icon_library_icon_key
  ON official_icon_library(icon_key);

CREATE INDEX IF NOT EXISTS idx_official_icon_library_pack_id
  ON official_icon_library(pack_id);

CREATE INDEX IF NOT EXISTS idx_official_icon_library_is_active
  ON official_icon_library(is_active);

CREATE INDEX IF NOT EXISTS idx_official_icon_library_created_at
  ON official_icon_library(created_at);

COMMIT;
