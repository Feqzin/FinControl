CREATE TABLE IF NOT EXISTS public.user_dashboard_shortcuts (
  user_id varchar PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  shortcuts jsonb NOT NULL DEFAULT '["/pessoas", "/renda", "/servicos"]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_dashboard_shortcuts ENABLE ROW LEVEL SECURITY;
