BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_pessoas_tipo_domain') THEN
    ALTER TABLE pessoas
      ADD CONSTRAINT ck_pessoas_tipo_domain
      CHECK (tipo IN ('me_deve', 'eu_devo'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_dividas_tipo_domain') THEN
    ALTER TABLE dividas
      ADD CONSTRAINT ck_dividas_tipo_domain
      CHECK (tipo IN ('receber', 'pagar'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_dividas_status_domain') THEN
    ALTER TABLE dividas
      ADD CONSTRAINT ck_dividas_status_domain
      CHECK (status IN ('pendente', 'parcial', 'pago', 'vencido', 'cancelado'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_dividas_forma_pagamento_domain') THEN
    ALTER TABLE dividas
      ADD CONSTRAINT ck_dividas_forma_pagamento_domain
      CHECK (
        forma_pagamento IS NULL
        OR forma_pagamento IN ('pix', 'dinheiro', 'cartao', 'debito', 'boleto', 'transferencia', 'simulacao', 'outros')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_dividas_total_parcelas_positive') THEN
    ALTER TABLE dividas
      ADD CONSTRAINT ck_dividas_total_parcelas_positive
      CHECK (total_parcelas IS NULL OR total_parcelas >= 1);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_parcelas_status_domain') THEN
    ALTER TABLE parcelas
      ADD CONSTRAINT ck_parcelas_status_domain
      CHECK (status IN ('pendente', 'parcial', 'pago', 'vencido', 'cancelado'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_parcelas_forma_pagamento_domain') THEN
    ALTER TABLE parcelas
      ADD CONSTRAINT ck_parcelas_forma_pagamento_domain
      CHECK (
        forma_pagamento IS NULL
        OR forma_pagamento IN ('pix', 'dinheiro', 'cartao', 'debito', 'boleto', 'transferencia', 'simulacao', 'outros')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_parcelas_numero_positive') THEN
    ALTER TABLE parcelas
      ADD CONSTRAINT ck_parcelas_numero_positive
      CHECK (numero >= 1);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_compras_cartao_status_pessoa_domain') THEN
    ALTER TABLE compras_cartao
      ADD CONSTRAINT ck_compras_cartao_status_pessoa_domain
      CHECK (
        status_pessoa IS NULL
        OR status_pessoa IN ('pendente', 'parcial', 'pago', 'vencido', 'cancelado')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_compras_cartao_parcelas_positive') THEN
    ALTER TABLE compras_cartao
      ADD CONSTRAINT ck_compras_cartao_parcelas_positive
      CHECK (parcelas >= 1 AND parcela_atual >= 1 AND parcela_atual <= parcelas);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_parcelas_compra_status_cartao_domain') THEN
    ALTER TABLE parcelas_compra
      ADD CONSTRAINT ck_parcelas_compra_status_cartao_domain
      CHECK (status_cartao IN ('pendente', 'parcial', 'pago', 'vencido', 'cancelado'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_parcelas_compra_status_pessoa_domain') THEN
    ALTER TABLE parcelas_compra
      ADD CONSTRAINT ck_parcelas_compra_status_pessoa_domain
      CHECK (
        status_pessoa IS NULL
        OR status_pessoa IN ('pendente', 'parcial', 'pago', 'vencido', 'cancelado')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_parcelas_compra_numero_positive') THEN
    ALTER TABLE parcelas_compra
      ADD CONSTRAINT ck_parcelas_compra_numero_positive
      CHECK (numero >= 1);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_servicos_categoria_domain') THEN
    ALTER TABLE servicos
      ADD CONSTRAINT ck_servicos_categoria_domain
      CHECK (categoria IN ('streaming', 'software', 'lazer', 'assinatura', 'utilidades', 'outros'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_servicos_forma_pagamento_domain') THEN
    ALTER TABLE servicos
      ADD CONSTRAINT ck_servicos_forma_pagamento_domain
      CHECK (
        forma_pagamento IN ('pix', 'dinheiro', 'cartao', 'debito', 'boleto', 'transferencia', 'outros')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_servicos_status_domain') THEN
    ALTER TABLE servicos
      ADD CONSTRAINT ck_servicos_status_domain
      CHECK (status IN ('ativo', 'cancelado', 'pausado'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_servicos_data_cobranca_range') THEN
    ALTER TABLE servicos
      ADD CONSTRAINT ck_servicos_data_cobranca_range
      CHECK (data_cobranca BETWEEN 1 AND 31);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_servico_pagamentos_status_domain') THEN
    ALTER TABLE servico_pagamentos
      ADD CONSTRAINT ck_servico_pagamentos_status_domain
      CHECK (status IN ('pendente', 'pago', 'cancelado'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_servico_pagamentos_mes_format') THEN
    ALTER TABLE servico_pagamentos
      ADD CONSTRAINT ck_servico_pagamentos_mes_format
      CHECK (mes ~ '^[0-9]{4}-[0-9]{2}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rendas_tipo_domain') THEN
    ALTER TABLE rendas
      ADD CONSTRAINT ck_rendas_tipo_domain
      CHECK (tipo IN ('fixo', 'variavel'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rendas_dia_recebimento_range') THEN
    ALTER TABLE rendas
      ADD CONSTRAINT ck_rendas_dia_recebimento_range
      CHECK (dia_recebimento BETWEEN 1 AND 31);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_patrimonios_tipo_domain') THEN
    ALTER TABLE patrimonios
      ADD CONSTRAINT ck_patrimonios_tipo_domain
      CHECK (tipo IN ('conta_bancaria', 'dinheiro', 'poupanca', 'investimento', 'outros'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_metas_status_domain') THEN
    ALTER TABLE metas
      ADD CONSTRAINT ck_metas_status_domain
      CHECK (status IN ('ativa', 'concluida', 'cancelada'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_import_logs_source_type_domain') THEN
    ALTER TABLE import_logs
      ADD CONSTRAINT ck_import_logs_source_type_domain
      CHECK (source_type IN ('texto', 'csv', 'ofx', 'qfx', 'manual'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_import_logs_status_domain') THEN
    ALTER TABLE import_logs
      ADD CONSTRAINT ck_import_logs_status_domain
      CHECK (status IN ('previewed', 'confirmed', 'rolled_back', 'failed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_import_logs_non_negative_totals') THEN
    ALTER TABLE import_logs
      ADD CONSTRAINT ck_import_logs_non_negative_totals
      CHECK (
        total_items >= 0
        AND imported_items >= 0
        AND skipped_items >= 0
        AND imported_items + skipped_items <= total_items
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_import_logs_average_confidence_range') THEN
    ALTER TABLE import_logs
      ADD CONSTRAINT ck_import_logs_average_confidence_range
      CHECK (
        average_confidence IS NULL
        OR (average_confidence >= 0 AND average_confidence <= 100)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dividas_user_status_vencimento
  ON dividas (user_id, status, data_vencimento);

CREATE INDEX IF NOT EXISTS idx_parcelas_user_status_vencimento
  ON parcelas (user_id, status, data_vencimento);

CREATE INDEX IF NOT EXISTS idx_parcelas_compra_user_status_vencimento
  ON parcelas_compra (user_id, status_cartao, data_vencimento);

CREATE INDEX IF NOT EXISTS idx_servico_pagamentos_user_mes
  ON servico_pagamentos (user_id, mes);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_parcelas_divida_numero'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT divida_id, numero, count(*) AS total
        FROM parcelas
        GROUP BY divida_id, numero
        HAVING count(*) > 1
      ) duplicates
    ) THEN
      RAISE NOTICE '[0005] Unique index uq_parcelas_divida_numero skipped (duplicates detected).';
    ELSE
      CREATE UNIQUE INDEX uq_parcelas_divida_numero ON parcelas (divida_id, numero);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_parcelas_compra_compra_numero'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT compra_cartao_id, numero, count(*) AS total
        FROM parcelas_compra
        GROUP BY compra_cartao_id, numero
        HAVING count(*) > 1
      ) duplicates
    ) THEN
      RAISE NOTICE '[0005] Unique index uq_parcelas_compra_compra_numero skipped (duplicates detected).';
    ELSE
      CREATE UNIQUE INDEX uq_parcelas_compra_compra_numero ON parcelas_compra (compra_cartao_id, numero);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_servico_pagamentos_servico_pessoa_mes'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT servico_pessoa_id, mes, count(*) AS total
        FROM servico_pagamentos
        GROUP BY servico_pessoa_id, mes
        HAVING count(*) > 1
      ) duplicates
    ) THEN
      RAISE NOTICE '[0005] Unique index uq_servico_pagamentos_servico_pessoa_mes skipped (duplicates detected).';
    ELSE
      CREATE UNIQUE INDEX uq_servico_pagamentos_servico_pessoa_mes ON servico_pagamentos (servico_pessoa_id, mes);
    END IF;
  END IF;
END $$;

COMMIT;
