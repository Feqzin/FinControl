BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'official_icon_packs'
  ) THEN
    ALTER TABLE public.official_icon_packs
      ADD COLUMN IF NOT EXISTS public_code text;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_official_icon_packs_public_code_unique
      ON public.official_icon_packs (public_code)
      WHERE public_code IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'official_icon_library'
  ) THEN
    ALTER TABLE public.official_icon_library
      ADD COLUMN IF NOT EXISTS pack_item_public_code text;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_official_icon_library_pack_item_public_code_unique
      ON public.official_icon_library (pack_item_public_code)
      WHERE pack_item_public_code IS NOT NULL;
  END IF;
END;
$$;

DO $$
DECLARE
  pack_row RECORD;
  item_row RECORD;
  last_owner_code text := NULL;
  last_pack_id text := NULL;
  owner_sequence integer := 0;
  item_sequence integer := 0;
  candidate_code text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'official_icon_packs'
  ) THEN
    FOR pack_row IN
      WITH pack_owner AS (
        SELECT
          p.id AS pack_id,
          p.created_at AS pack_created_at,
          COALESCE(
            MAX(CASE
              WHEN o.icon_key LIKE 'community:%'
                THEN NULLIF(split_part(split_part(o.icon_key, 'community:', 2), ':', 1), '')
              ELSE NULL
            END),
            MAX(o.created_by)
          ) AS owner_user_id
        FROM public.official_icon_packs p
        LEFT JOIN public.official_icon_library o
          ON o.pack_id = p.id
        GROUP BY p.id, p.created_at
      )
      SELECT
        po.pack_id,
        po.pack_created_at,
        COALESCE(
          NULLIF(u.public_code, ''),
          CASE
            WHEN po.owner_user_id IS NOT NULL
              THEN concat('USR-', upper(substr(md5(po.owner_user_id::text), 1, 10)))
            ELSE 'USR-SYSTEM'
          END
        ) AS owner_public_code
      FROM pack_owner po
      LEFT JOIN public.users u
        ON u.id = po.owner_user_id
      JOIN public.official_icon_packs p
        ON p.id = po.pack_id
      WHERE p.public_code IS NULL
         OR btrim(p.public_code) = ''
      ORDER BY
        COALESCE(
          NULLIF(u.public_code, ''),
          CASE
            WHEN po.owner_user_id IS NOT NULL
              THEN concat('USR-', upper(substr(md5(po.owner_user_id::text), 1, 10)))
            ELSE 'USR-SYSTEM'
          END
        ),
        po.pack_created_at,
        po.pack_id
    LOOP
      IF last_owner_code IS DISTINCT FROM pack_row.owner_public_code THEN
        last_owner_code := pack_row.owner_public_code;
        owner_sequence := 1;
      ELSE
        owner_sequence := owner_sequence + 1;
      END IF;

      candidate_code := concat(pack_row.owner_public_code, '-P', lpad(owner_sequence::text, 3, '0'));
      WHILE EXISTS (
        SELECT 1
        FROM public.official_icon_packs existing_pack
        WHERE existing_pack.public_code = candidate_code
          AND existing_pack.id <> pack_row.pack_id
      ) LOOP
        owner_sequence := owner_sequence + 1;
        candidate_code := concat(pack_row.owner_public_code, '-P', lpad(owner_sequence::text, 3, '0'));
      END LOOP;

      UPDATE public.official_icon_packs
         SET public_code = candidate_code
       WHERE id = pack_row.pack_id;
    END LOOP;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'official_icon_library'
  ) THEN
    FOR item_row IN
      SELECT
        i.id AS icon_id,
        i.pack_id,
        p.public_code AS pack_public_code,
        i.created_at AS icon_created_at
      FROM public.official_icon_library i
      JOIN public.official_icon_packs p
        ON p.id = i.pack_id
      WHERE i.pack_id IS NOT NULL
        AND (i.pack_item_public_code IS NULL OR btrim(i.pack_item_public_code) = '')
      ORDER BY p.public_code, i.created_at, i.id
    LOOP
      IF last_pack_id IS DISTINCT FROM item_row.pack_id THEN
        last_pack_id := item_row.pack_id;
        item_sequence := 1;
      ELSE
        item_sequence := item_sequence + 1;
      END IF;

      candidate_code := concat(item_row.pack_public_code, '-I', lpad(item_sequence::text, 3, '0'));
      WHILE EXISTS (
        SELECT 1
        FROM public.official_icon_library existing_icon
        WHERE existing_icon.pack_item_public_code = candidate_code
          AND existing_icon.id <> item_row.icon_id
      ) LOOP
        item_sequence := item_sequence + 1;
        candidate_code := concat(item_row.pack_public_code, '-I', lpad(item_sequence::text, 3, '0'));
      END LOOP;

      UPDATE public.official_icon_library
         SET pack_item_public_code = candidate_code
       WHERE id = item_row.icon_id;
    END LOOP;
  END IF;
END;
$$;

COMMIT;
