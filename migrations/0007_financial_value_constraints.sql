BEGIN;

-- Hardening incremental de valores financeiros.
-- Reversao manual (se necessario): DROP CONSTRAINT <nome>; DROP INDEX <nome>;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_dividas_valor_non_negative') THEN
    IF EXISTS (
      SELECT 1
      FROM dividas
      WHERE valor < 0
    ) THEN
      RAISE NOTICE '[0007] ck_dividas_valor_non_negative skipped (invalid legacy rows).';
    ELSE
      ALTER TABLE dividas
        ADD CONSTRAINT ck_dividas_valor_non_negative
        CHECK (valor >= 0);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_dividas_valor_total_non_negative') THEN
    IF EXISTS (
      SELECT 1
      FROM dividas
      WHERE valor_total IS NOT NULL
        AND valor_total < 0
    ) THEN
      RAISE NOTICE '[0007] ck_dividas_valor_total_non_negative skipped (invalid legacy rows).';
    ELSE
      ALTER TABLE dividas
        ADD CONSTRAINT ck_dividas_valor_total_non_negative
        CHECK (valor_total IS NULL OR valor_total >= 0);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_parcelas_valor_positive') THEN
    IF EXISTS (
      SELECT 1
      FROM parcelas
      WHERE valor <= 0
    ) THEN
      RAISE NOTICE '[0007] ck_parcelas_valor_positive skipped (invalid legacy rows).';
    ELSE
      ALTER TABLE parcelas
        ADD CONSTRAINT ck_parcelas_valor_positive
        CHECK (valor > 0);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_parcelas_compra_valor_positive') THEN
    IF EXISTS (
      SELECT 1
      FROM parcelas_compra
      WHERE valor <= 0
    ) THEN
      RAISE NOTICE '[0007] ck_parcelas_compra_valor_positive skipped (invalid legacy rows).';
    ELSE
      ALTER TABLE parcelas_compra
        ADD CONSTRAINT ck_parcelas_compra_valor_positive
        CHECK (valor > 0);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_cartoes_limite_positive') THEN
    IF EXISTS (
      SELECT 1
      FROM cartoes
      WHERE limite <= 0
    ) THEN
      RAISE NOTICE '[0007] ck_cartoes_limite_positive skipped (invalid legacy rows).';
    ELSE
      ALTER TABLE cartoes
        ADD CONSTRAINT ck_cartoes_limite_positive
        CHECK (limite > 0);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_compras_cartao_valores_positive') THEN
    IF EXISTS (
      SELECT 1
      FROM compras_cartao
      WHERE valor_total <= 0
         OR valor_parcela <= 0
    ) THEN
      RAISE NOTICE '[0007] ck_compras_cartao_valores_positive skipped (invalid legacy rows).';
    ELSE
      ALTER TABLE compras_cartao
        ADD CONSTRAINT ck_compras_cartao_valores_positive
        CHECK (valor_total > 0 AND valor_parcela > 0);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_servicos_valor_mensal_non_negative') THEN
    IF EXISTS (
      SELECT 1
      FROM servicos
      WHERE valor_mensal < 0
    ) THEN
      RAISE NOTICE '[0007] ck_servicos_valor_mensal_non_negative skipped (invalid legacy rows).';
    ELSE
      ALTER TABLE servicos
        ADD CONSTRAINT ck_servicos_valor_mensal_non_negative
        CHECK (valor_mensal >= 0);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_servico_pessoas_valor_devido_non_negative') THEN
    IF EXISTS (
      SELECT 1
      FROM servico_pessoas
      WHERE valor_devido < 0
    ) THEN
      RAISE NOTICE '[0007] ck_servico_pessoas_valor_devido_non_negative skipped (invalid legacy rows).';
    ELSE
      ALTER TABLE servico_pessoas
        ADD CONSTRAINT ck_servico_pessoas_valor_devido_non_negative
        CHECK (valor_devido >= 0);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_rendas_valor_non_negative') THEN
    IF EXISTS (
      SELECT 1
      FROM rendas
      WHERE valor < 0
    ) THEN
      RAISE NOTICE '[0007] ck_rendas_valor_non_negative skipped (invalid legacy rows).';
    ELSE
      ALTER TABLE rendas
        ADD CONSTRAINT ck_rendas_valor_non_negative
        CHECK (valor >= 0);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_metas_valores_domain') THEN
    IF EXISTS (
      SELECT 1
      FROM metas
      WHERE valor_alvo <= 0
         OR valor_atual < 0
    ) THEN
      RAISE NOTICE '[0007] ck_metas_valores_domain skipped (invalid legacy rows).';
    ELSE
      ALTER TABLE metas
        ADD CONSTRAINT ck_metas_valores_domain
        CHECK (valor_alvo > 0 AND valor_atual >= 0);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_servico_pessoas_servico_pessoa'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT servico_id, pessoa_id, count(*) AS total
        FROM servico_pessoas
        GROUP BY servico_id, pessoa_id
        HAVING count(*) > 1
      ) duplicates
    ) THEN
      RAISE NOTICE '[0007] Unique index uq_servico_pessoas_servico_pessoa skipped (duplicates detected).';
    ELSE
      CREATE UNIQUE INDEX uq_servico_pessoas_servico_pessoa
        ON servico_pessoas (servico_id, pessoa_id);
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_compras_cartao_user_cartao_data
  ON compras_cartao (user_id, cartao_id, data_compra);

CREATE INDEX IF NOT EXISTS idx_parcelas_compra_user_compra_numero
  ON parcelas_compra (user_id, compra_cartao_id, numero);

CREATE INDEX IF NOT EXISTS idx_import_logs_user_status_created_at
  ON import_logs (user_id, status, created_at DESC);

COMMIT;
