ALTER TABLE public.pessoas
  ADD COLUMN IF NOT EXISTS lista_negra boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lista_negra_motivo text;

ALTER TABLE public.dividas
  ADD COLUMN IF NOT EXISTS expectativa_recebimento boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_pessoas_user_lista_negra
  ON public.pessoas (user_id, lista_negra);

CREATE INDEX IF NOT EXISTS idx_dividas_user_expectativa_recebimento
  ON public.dividas (user_id, expectativa_recebimento);
