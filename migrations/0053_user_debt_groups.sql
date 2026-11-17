CREATE TABLE IF NOT EXISTS public.user_debt_groups (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  debt_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(debt_ids) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_debt_groups_user ON public.user_debt_groups(user_id);
ALTER TABLE public.user_debt_groups ENABLE ROW LEVEL SECURITY;
