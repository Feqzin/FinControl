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
      ADD COLUMN IF NOT EXISTS public_code text;

    UPDATE public.users
      SET public_code = concat('USR-', upper(substr(md5(id::text), 1, 10)))
      WHERE public_code IS NULL
         OR btrim(public_code) = '';

    WITH duplicated_codes AS (
      SELECT
        id,
        public_code,
        row_number() OVER (PARTITION BY public_code ORDER BY id) AS row_num
      FROM public.users
      WHERE public_code IS NOT NULL
    )
    UPDATE public.users AS target
      SET public_code = concat(duplicated_codes.public_code, '-', duplicated_codes.row_num)
      FROM duplicated_codes
      WHERE target.id = duplicated_codes.id
        AND duplicated_codes.row_num > 1;

    ALTER TABLE public.users
      ALTER COLUMN public_code SET DEFAULT concat('USR-', upper(substr(md5(gen_random_uuid()::text), 1, 10)));

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_public_code_unique
      ON public.users (public_code)
      WHERE public_code IS NOT NULL;
  END IF;
END;
$$;

COMMIT;
