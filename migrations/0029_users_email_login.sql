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
      ADD COLUMN IF NOT EXISTS email text;

    -- Legacy backfill #1: contas antigas que ainda usam e-mail no username.
    UPDATE public.users
      SET email = lower(btrim(username))
      WHERE (email IS NULL OR btrim(email) = '')
        AND username ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

    -- Legacy backfill #2: recupera e-mail de registros de cadastro no audit log.
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'audit_events'
    ) THEN
      WITH register_email_candidates AS (
        SELECT DISTINCT ON (ae.user_id)
          ae.user_id,
          lower(btrim(ae.details->>'username')) AS email_candidate
        FROM public.audit_events ae
        WHERE ae.user_id IS NOT NULL
          AND ae.domain = 'auth.register'
          AND ae.status = 'success'
          AND ae.details ? 'username'
          AND (ae.details->>'username') ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        ORDER BY ae.user_id, ae.created_at DESC
      )
      UPDATE public.users u
      SET email = register_email_candidates.email_candidate
      FROM register_email_candidates
      WHERE u.id = register_email_candidates.user_id
        AND (u.email IS NULL OR btrim(u.email) = '');
    END IF;

    UPDATE public.users
      SET email = NULL
      WHERE email IS NOT NULL
        AND btrim(email) = '';

    UPDATE public.users
      SET email = lower(btrim(email))
      WHERE email IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_users_email_lower
      ON public.users (lower(email))
      WHERE email IS NOT NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM public.users
      WHERE email IS NOT NULL
      GROUP BY lower(email)
      HAVING count(*) > 1
    ) THEN
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique
        ON public.users (lower(email))
        WHERE email IS NOT NULL;
    END IF;
  END IF;
END;
$$;

COMMIT;
