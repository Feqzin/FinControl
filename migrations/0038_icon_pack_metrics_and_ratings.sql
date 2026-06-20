BEGIN;

ALTER TABLE public.official_icon_packs
  ADD COLUMN IF NOT EXISTS cover_icon_id varchar;

CREATE INDEX IF NOT EXISTS idx_official_icon_packs_cover_icon_id
  ON public.official_icon_packs(cover_icon_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'official_icon_packs_cover_icon_id_fkey'
      AND conrelid = 'public.official_icon_packs'::regclass
  ) THEN
    ALTER TABLE public.official_icon_packs
      ADD CONSTRAINT official_icon_packs_cover_icon_id_fkey
      FOREIGN KEY (cover_icon_id)
      REFERENCES public.official_icon_library(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.icon_pack_installs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pack_id varchar NOT NULL REFERENCES public.official_icon_packs(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_icon_pack_installs_user_pack_unique
  ON public.icon_pack_installs(user_id, pack_id);

CREATE INDEX IF NOT EXISTS idx_icon_pack_installs_user_id
  ON public.icon_pack_installs(user_id);

CREATE INDEX IF NOT EXISTS idx_icon_pack_installs_pack_id
  ON public.icon_pack_installs(pack_id);

CREATE INDEX IF NOT EXISTS idx_icon_pack_installs_created_at
  ON public.icon_pack_installs(created_at);

CREATE TABLE IF NOT EXISTS public.icon_pack_ratings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pack_id varchar NOT NULL REFERENCES public.official_icon_packs(id) ON DELETE CASCADE,
  rating integer NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_icon_pack_ratings_user_pack_unique
  ON public.icon_pack_ratings(user_id, pack_id);

CREATE INDEX IF NOT EXISTS idx_icon_pack_ratings_user_id
  ON public.icon_pack_ratings(user_id);

CREATE INDEX IF NOT EXISTS idx_icon_pack_ratings_pack_id
  ON public.icon_pack_ratings(pack_id);

CREATE INDEX IF NOT EXISTS idx_icon_pack_ratings_created_at
  ON public.icon_pack_ratings(created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'icon_pack_ratings_rating_check'
      AND conrelid = 'public.icon_pack_ratings'::regclass
  ) THEN
    ALTER TABLE public.icon_pack_ratings
      ADD CONSTRAINT icon_pack_ratings_rating_check
      CHECK (rating BETWEEN 1 AND 5);
  END IF;
END $$;

COMMIT;
