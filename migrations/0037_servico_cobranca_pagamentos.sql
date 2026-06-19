BEGIN;

CREATE TABLE IF NOT EXISTS public.servico_cobranca_pagamentos (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  servico_id varchar NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  competencia_mes integer NOT NULL,
  competencia_ano integer NOT NULL,
  valor_pago numeric(12, 2) NOT NULL,
  data_pagamento date NOT NULL,
  observacao text,
  cancelado_em timestamp,
  motivo_cancelamento text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_servico_cobranca_pagamentos_user_id
  ON public.servico_cobranca_pagamentos(user_id);

CREATE INDEX IF NOT EXISTS idx_servico_cobranca_pagamentos_servico_id
  ON public.servico_cobranca_pagamentos(servico_id);

CREATE INDEX IF NOT EXISTS idx_servico_cobranca_pagamentos_competencia
  ON public.servico_cobranca_pagamentos(user_id, servico_id, competencia_ano, competencia_mes);

CREATE INDEX IF NOT EXISTS idx_servico_cobranca_pagamentos_data_pagamento
  ON public.servico_cobranca_pagamentos(data_pagamento);

CREATE INDEX IF NOT EXISTS idx_servico_cobranca_pagamentos_created_at
  ON public.servico_cobranca_pagamentos(created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'servico_cobranca_pagamentos_competencia_mes_check'
      AND conrelid = 'public.servico_cobranca_pagamentos'::regclass
  ) THEN
    ALTER TABLE public.servico_cobranca_pagamentos
      ADD CONSTRAINT servico_cobranca_pagamentos_competencia_mes_check
      CHECK (competencia_mes BETWEEN 1 AND 12);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'servico_cobranca_pagamentos_valor_pago_check'
      AND conrelid = 'public.servico_cobranca_pagamentos'::regclass
  ) THEN
    ALTER TABLE public.servico_cobranca_pagamentos
      ADD CONSTRAINT servico_cobranca_pagamentos_valor_pago_check
      CHECK (valor_pago >= 0);
  END IF;
END $$;

COMMIT;
