BEGIN;

ALTER TABLE servicos
  ADD COLUMN IF NOT EXISTS periodicidade_cobranca text,
  ADD COLUMN IF NOT EXISTS valor_cobranca numeric(12, 2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'servicos_periodicidade_cobranca_check'
  ) THEN
    ALTER TABLE servicos
      ADD CONSTRAINT servicos_periodicidade_cobranca_check
      CHECK (
        periodicidade_cobranca IS NULL
        OR periodicidade_cobranca IN ('mensal', 'anual', 'semestral', 'trimestral', 'bimestral', 'semanal')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'servicos_valor_cobranca_check'
  ) THEN
    ALTER TABLE servicos
      ADD CONSTRAINT servicos_valor_cobranca_check
      CHECK (valor_cobranca IS NULL OR valor_cobranca >= 0);
  END IF;
END $$;

COMMIT;
