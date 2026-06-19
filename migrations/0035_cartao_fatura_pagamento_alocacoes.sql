BEGIN;

ALTER TABLE public.cartao_fatura_pagamentos
  ADD COLUMN IF NOT EXISTS modo_alocacao text NOT NULL DEFAULT 'ordem_fatura';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cartao_fatura_pagamentos_modo_alocacao_check'
      AND conrelid = 'public.cartao_fatura_pagamentos'::regclass
  ) THEN
    ALTER TABLE public.cartao_fatura_pagamentos
      ADD CONSTRAINT cartao_fatura_pagamentos_modo_alocacao_check
      CHECK (modo_alocacao IN ('ordem_fatura', 'menores_primeiro', 'maiores_primeiro', 'manual'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.cartao_fatura_pagamento_alocacoes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  pagamento_id varchar NOT NULL REFERENCES public.cartao_fatura_pagamentos(id) ON DELETE CASCADE,
  parcela_compra_id varchar NOT NULL REFERENCES public.parcelas_compra(id) ON DELETE CASCADE,
  valor_aplicado numeric(12, 2) NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cartao_fatura_pagamento_alocacoes_pagamento_id
  ON public.cartao_fatura_pagamento_alocacoes(pagamento_id);

CREATE INDEX IF NOT EXISTS idx_cartao_fatura_pagamento_alocacoes_parcela_compra_id
  ON public.cartao_fatura_pagamento_alocacoes(parcela_compra_id);

CREATE INDEX IF NOT EXISTS idx_cartao_fatura_pagamento_alocacoes_created_at
  ON public.cartao_fatura_pagamento_alocacoes(created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cartao_fatura_pagamento_alocacoes_valor_aplicado_check'
      AND conrelid = 'public.cartao_fatura_pagamento_alocacoes'::regclass
  ) THEN
    ALTER TABLE public.cartao_fatura_pagamento_alocacoes
      ADD CONSTRAINT cartao_fatura_pagamento_alocacoes_valor_aplicado_check
      CHECK (valor_aplicado >= 0);
  END IF;
END $$;

COMMIT;
