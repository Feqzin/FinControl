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
      ADD COLUMN IF NOT EXISTS trial_started_at timestamp,
      ADD COLUMN IF NOT EXISTS trial_ends_at timestamp,
      ADD COLUMN IF NOT EXISTS trial_used_at timestamp;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'chk_users_trial_window'
        AND conrelid = 'public.users'::regclass
    ) THEN
      ALTER TABLE public.users
        ADD CONSTRAINT chk_users_trial_window
        CHECK (
          trial_ends_at IS NULL
          OR trial_started_at IS NULL
          OR trial_ends_at >= trial_started_at
        );
    END IF;
  END IF;
END;
$$;

COMMIT;
