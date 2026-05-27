BEGIN;

ALTER TABLE public.servicos
  ALTER COLUMN data_cobranca DROP NOT NULL;

COMMIT;
