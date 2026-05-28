BEGIN;

ALTER TABLE public.dividas
  ADD COLUMN IF NOT EXISTS deleted_at timestamp;

CREATE INDEX IF NOT EXISTS idx_dividas_user_deleted_at
  ON public.dividas (user_id, deleted_at);

COMMIT;
