BEGIN;

ALTER TABLE public.official_icon_packs
  ADD COLUMN IF NOT EXISTS owner_user_id varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'official_icon_packs_owner_user_id_fkey'
      AND conrelid = 'public.official_icon_packs'::regclass
  ) THEN
    ALTER TABLE public.official_icon_packs
      ADD CONSTRAINT official_icon_packs_owner_user_id_fkey
      FOREIGN KEY (owner_user_id)
      REFERENCES public.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_official_icon_packs_owner_user_id
  ON public.official_icon_packs(owner_user_id);

UPDATE public.official_icon_packs AS pack
SET owner_user_id = owner.created_by
FROM (
  SELECT DISTINCT ON (pack_id)
    pack_id,
    created_by
  FROM public.official_icon_library
  WHERE pack_id IS NOT NULL
    AND created_by IS NOT NULL
    AND icon_key LIKE 'community:%'
  ORDER BY pack_id, created_at, id
) AS owner
WHERE pack.id = owner.pack_id
  AND pack.owner_user_id IS NULL;

CREATE TABLE IF NOT EXISTS public.user_public_profiles (
  user_id varchar PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  bio text,
  profile_visibility text NOT NULL DEFAULT 'private',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_public_profiles_visibility_check'
      AND conrelid = 'public.user_public_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_public_profiles
      ADD CONSTRAINT user_public_profiles_visibility_check
      CHECK (profile_visibility IN ('private', 'community'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_public_profiles_visibility
  ON public.user_public_profiles(profile_visibility);

CREATE INDEX IF NOT EXISTS idx_user_public_profiles_updated_at
  ON public.user_public_profiles(updated_at);

INSERT INTO public.user_public_profiles (user_id, profile_visibility)
SELECT DISTINCT owner_user_id, 'community'
FROM public.official_icon_packs
WHERE owner_user_id IS NOT NULL
  AND is_active = true
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
