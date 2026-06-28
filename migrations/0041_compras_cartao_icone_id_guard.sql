ALTER TABLE public.compras_cartao
  ADD COLUMN IF NOT EXISTS icone_id text;

CREATE INDEX IF NOT EXISTS idx_compras_cartao_icone_id
  ON public.compras_cartao (icone_id);
