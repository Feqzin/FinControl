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
      ADD COLUMN IF NOT EXISTS subscription_tier text;

    UPDATE public.users
      SET subscription_tier = lower(btrim(subscription_tier))
      WHERE subscription_tier IS NOT NULL;

    UPDATE public.users
      SET subscription_tier = 'free'
      WHERE subscription_tier IS NULL
        OR subscription_tier NOT IN ('free', 'premium');

    ALTER TABLE public.users
      ALTER COLUMN subscription_tier SET DEFAULT 'free',
      ALTER COLUMN subscription_tier SET NOT NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'chk_users_subscription_tier'
        AND conrelid = 'public.users'::regclass
    ) THEN
      ALTER TABLE public.users
        ADD CONSTRAINT chk_users_subscription_tier
        CHECK (subscription_tier IN ('free', 'premium'));
    END IF;
  END IF;
END;
$$;

COMMIT;
