BEGIN;

ALTER TABLE public.pessoas
  ADD COLUMN IF NOT EXISTS deleted_at timestamp;

CREATE INDEX IF NOT EXISTS idx_pessoas_user_deleted_at
  ON public.pessoas (user_id, deleted_at);

COMMIT;
