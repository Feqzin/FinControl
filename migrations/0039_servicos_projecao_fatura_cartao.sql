ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS cartao_id varchar,
  ADD COLUMN IF NOT EXISTS projetar_na_fatura_cartao boolean NOT NULL DEFAULT false;

UPDATE public.servicos AS servico
SET cartao_id = compra.cartao_id
FROM public.compras_cartao AS compra
WHERE servico.compra_cartao_id = compra.id
  AND servico.cartao_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'servicos_cartao_id_fkey'
      AND conrelid = 'public.servicos'::regclass
  ) THEN
    ALTER TABLE public.servicos
      ADD CONSTRAINT servicos_cartao_id_fkey
      FOREIGN KEY (cartao_id)
      REFERENCES public.cartoes(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_servicos_cartao_id
  ON public.servicos(cartao_id);
