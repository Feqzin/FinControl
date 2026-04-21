BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'users'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN IF NOT EXISTS nome_completo text,
      ADD COLUMN IF NOT EXISTS reset_token text,
      ADD COLUMN IF NOT EXISTS reset_token_expiry timestamp;

    CREATE INDEX IF NOT EXISTS idx_users_reset_token
      ON public.users (reset_token);
  END IF;
END;
$$;

COMMIT;
