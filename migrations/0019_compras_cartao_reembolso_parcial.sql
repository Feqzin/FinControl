BEGIN;

ALTER TABLE compras_cartao
  ADD COLUMN IF NOT EXISTS reembolso_modo text,
  ADD COLUMN IF NOT EXISTS reembolso_valor_total numeric(12, 2),
  ADD COLUMN IF NOT EXISTS reembolso_percentual numeric(7, 4);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compras_cartao_reembolso_modo_check'
  ) THEN
    ALTER TABLE compras_cartao
      ADD CONSTRAINT compras_cartao_reembolso_modo_check
      CHECK (
        reembolso_modo IS NULL
        OR reembolso_modo IN ('total', 'metade', 'valor_custom', 'percentual_custom')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compras_cartao_reembolso_valor_check'
  ) THEN
    ALTER TABLE compras_cartao
      ADD CONSTRAINT compras_cartao_reembolso_valor_check
      CHECK (
        reembolso_valor_total IS NULL
        OR (
          reembolso_valor_total >= 0
          AND reembolso_valor_total <= valor_total
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'compras_cartao_reembolso_percentual_check'
  ) THEN
    ALTER TABLE compras_cartao
      ADD CONSTRAINT compras_cartao_reembolso_percentual_check
      CHECK (
        reembolso_percentual IS NULL
        OR (
          reembolso_percentual >= 0
          AND reembolso_percentual <= 100
        )
      );
  END IF;
END $$;

COMMIT;
