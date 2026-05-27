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
      ADD COLUMN IF NOT EXISTS full_name_visibility text;

    UPDATE public.users
      SET full_name_visibility = 'private'
      WHERE full_name_visibility IS NULL
         OR btrim(full_name_visibility) = '';

    ALTER TABLE public.users
      ALTER COLUMN full_name_visibility SET DEFAULT 'private';
    ALTER TABLE public.users
      ALTER COLUMN full_name_visibility SET NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_users_username_lower
      ON public.users (lower(username));

    IF NOT EXISTS (
      SELECT 1
      FROM public.users
      GROUP BY lower(username)
      HAVING count(*) > 1
    ) THEN
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower_unique
        ON public.users (lower(username))
        WHERE username IS NOT NULL;
    END IF;
  END IF;
END;
$$;

COMMIT;
