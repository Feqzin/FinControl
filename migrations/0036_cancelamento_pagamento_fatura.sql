BEGIN;

ALTER TABLE public.cartao_fatura_pagamentos
  ADD COLUMN IF NOT EXISTS cancelado_em timestamp,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
  ADD COLUMN IF NOT EXISTS cancelado_por varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cartao_fatura_pagamentos_cancelado_por_fkey'
      AND conrelid = 'public.cartao_fatura_pagamentos'::regclass
  ) THEN
    ALTER TABLE public.cartao_fatura_pagamentos
      ADD CONSTRAINT cartao_fatura_pagamentos_cancelado_por_fkey
      FOREIGN KEY (cancelado_por)
      REFERENCES public.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cartao_fatura_pagamentos_cancelado_em
  ON public.cartao_fatura_pagamentos(cancelado_em);

CREATE INDEX IF NOT EXISTS idx_cartao_fatura_pagamentos_cancelado_por
  ON public.cartao_fatura_pagamentos(cancelado_por);

COMMIT;
