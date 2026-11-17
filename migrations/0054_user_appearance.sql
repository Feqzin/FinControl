CREATE TABLE IF NOT EXISTS public.user_appearance (
  user_id varchar PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  accent_color text NOT NULL DEFAULT '#9b2bd6' CHECK (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_appearance ENABLE ROW LEVEL SECURITY;
