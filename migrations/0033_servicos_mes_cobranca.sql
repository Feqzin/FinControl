BEGIN;

ALTER TABLE servicos
  ADD COLUMN IF NOT EXISTS mes_cobranca integer;

UPDATE servicos
SET mes_cobranca = EXTRACT(MONTH FROM CURRENT_DATE)::integer
WHERE periodicidade_cobranca = 'anual'
  AND mes_cobranca IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'servicos_mes_cobranca_check'
  ) THEN
    ALTER TABLE servicos
      ADD CONSTRAINT servicos_mes_cobranca_check
      CHECK (mes_cobranca IS NULL OR mes_cobranca BETWEEN 1 AND 12);
  END IF;
END $$;

COMMIT;
