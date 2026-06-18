BEGIN;

CREATE TABLE IF NOT EXISTS cartao_fatura_pagamentos (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cartao_id varchar NOT NULL REFERENCES cartoes(id) ON DELETE CASCADE,
  competencia_mes integer NOT NULL,
  competencia_ano integer NOT NULL,
  valor_pago numeric(12, 2) NOT NULL,
  data_pagamento date NOT NULL,
  observacao text,
  tipo_pagamento text NOT NULL DEFAULT 'parcial',
  considerar_no_saldo_competencia boolean NOT NULL DEFAULT true,
  conciliado_em timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cartao_fatura_pagamentos_user_id
  ON cartao_fatura_pagamentos(user_id);

CREATE INDEX IF NOT EXISTS idx_cartao_fatura_pagamentos_cartao_id
  ON cartao_fatura_pagamentos(cartao_id);

CREATE INDEX IF NOT EXISTS idx_cartao_fatura_pagamentos_competencia
  ON cartao_fatura_pagamentos(user_id, cartao_id, competencia_ano, competencia_mes);

CREATE INDEX IF NOT EXISTS idx_cartao_fatura_pagamentos_data_pagamento
  ON cartao_fatura_pagamentos(data_pagamento);

CREATE INDEX IF NOT EXISTS idx_cartao_fatura_pagamentos_created_at
  ON cartao_fatura_pagamentos(created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cartao_fatura_pagamentos_competencia_mes_check'
  ) THEN
    ALTER TABLE cartao_fatura_pagamentos
      ADD CONSTRAINT cartao_fatura_pagamentos_competencia_mes_check
      CHECK (competencia_mes BETWEEN 1 AND 12);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cartao_fatura_pagamentos_valor_pago_check'
  ) THEN
    ALTER TABLE cartao_fatura_pagamentos
      ADD CONSTRAINT cartao_fatura_pagamentos_valor_pago_check
      CHECK (valor_pago >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cartao_fatura_pagamentos_tipo_pagamento_check'
  ) THEN
    ALTER TABLE cartao_fatura_pagamentos
      ADD CONSTRAINT cartao_fatura_pagamentos_tipo_pagamento_check
      CHECK (tipo_pagamento IN ('parcial', 'quitacao_total'));
  END IF;
END $$;

COMMIT;
