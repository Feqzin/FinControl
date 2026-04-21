BEGIN;

CREATE OR REPLACE FUNCTION _safe_parse_fin_date(input text)
RETURNS date
LANGUAGE plpgsql
AS $$
DECLARE
  cleaned text;
  parsed date;
BEGIN
  IF input IS NULL THEN
    RETURN NULL;
  END IF;

  cleaned := btrim(input);
  IF cleaned = '' THEN
    RETURN NULL;
  END IF;

  IF cleaned ~ '^\d{4}-\d{2}-\d{2}([T ].*)?$' THEN
    BEGIN
      parsed := substring(cleaned FROM 1 FOR 10)::date;
      IF to_char(parsed, 'YYYY-MM-DD') = substring(cleaned FROM 1 FOR 10) THEN
        RETURN parsed;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  IF cleaned ~ '^\d{2}/\d{2}/\d{4}$' THEN
    BEGIN
      parsed := to_date(cleaned, 'DD/MM/YYYY');
      IF to_char(parsed, 'DD/MM/YYYY') = cleaned THEN
        RETURN parsed;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  IF cleaned ~ '^\d{4}/\d{2}/\d{2}$' THEN
    BEGIN
      parsed := to_date(cleaned, 'YYYY/MM/DD');
      IF to_char(parsed, 'YYYY/MM/DD') = cleaned THEN
        RETURN parsed;
      END IF;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION _safe_parse_fin_date(input date)
RETURNS date
LANGUAGE sql
AS $$
  SELECT input;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM dividas
    WHERE data_vencimento IS NOT NULL
      AND _safe_parse_fin_date(data_vencimento) IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 0002 aborted: invalid value in dividas.data_vencimento';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM dividas
    WHERE data_pagamento IS NOT NULL
      AND _safe_parse_fin_date(data_pagamento) IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 0002 aborted: invalid value in dividas.data_pagamento';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM parcelas
    WHERE _safe_parse_fin_date(data_vencimento) IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 0002 aborted: invalid value in parcelas.data_vencimento';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM parcelas
    WHERE data_pagamento IS NOT NULL
      AND _safe_parse_fin_date(data_pagamento) IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 0002 aborted: invalid value in parcelas.data_pagamento';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM compras_cartao
    WHERE _safe_parse_fin_date(data_compra) IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 0002 aborted: invalid value in compras_cartao.data_compra';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM compras_cartao
    WHERE data_pagamento_pessoa IS NOT NULL
      AND _safe_parse_fin_date(data_pagamento_pessoa) IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 0002 aborted: invalid value in compras_cartao.data_pagamento_pessoa';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM servico_pagamentos
    WHERE data_pagamento IS NOT NULL
      AND _safe_parse_fin_date(data_pagamento) IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 0002 aborted: invalid value in servico_pagamentos.data_pagamento';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM parcelas_compra
    WHERE data_vencimento IS NOT NULL
      AND _safe_parse_fin_date(data_vencimento) IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 0002 aborted: invalid value in parcelas_compra.data_vencimento';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM parcelas_compra
    WHERE data_pagamento_cartao IS NOT NULL
      AND _safe_parse_fin_date(data_pagamento_cartao) IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 0002 aborted: invalid value in parcelas_compra.data_pagamento_cartao';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM parcelas_compra
    WHERE data_pagamento_pessoa IS NOT NULL
      AND _safe_parse_fin_date(data_pagamento_pessoa) IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 0002 aborted: invalid value in parcelas_compra.data_pagamento_pessoa';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dividas'
      AND column_name = 'data_vencimento'
      AND data_type <> 'date'
  ) THEN
    ALTER TABLE dividas
      ALTER COLUMN data_vencimento TYPE date USING _safe_parse_fin_date(data_vencimento);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dividas'
      AND column_name = 'data_pagamento'
      AND data_type <> 'date'
  ) THEN
    ALTER TABLE dividas
      ALTER COLUMN data_pagamento TYPE date USING _safe_parse_fin_date(data_pagamento);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parcelas'
      AND column_name = 'data_vencimento'
      AND data_type <> 'date'
  ) THEN
    ALTER TABLE parcelas
      ALTER COLUMN data_vencimento TYPE date USING _safe_parse_fin_date(data_vencimento);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parcelas'
      AND column_name = 'data_pagamento'
      AND data_type <> 'date'
  ) THEN
    ALTER TABLE parcelas
      ALTER COLUMN data_pagamento TYPE date USING _safe_parse_fin_date(data_pagamento);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'compras_cartao'
      AND column_name = 'data_compra'
      AND data_type <> 'date'
  ) THEN
    ALTER TABLE compras_cartao
      ALTER COLUMN data_compra TYPE date USING _safe_parse_fin_date(data_compra);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'compras_cartao'
      AND column_name = 'data_pagamento_pessoa'
      AND data_type <> 'date'
  ) THEN
    ALTER TABLE compras_cartao
      ALTER COLUMN data_pagamento_pessoa TYPE date USING _safe_parse_fin_date(data_pagamento_pessoa);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'servico_pagamentos'
      AND column_name = 'data_pagamento'
      AND data_type <> 'date'
  ) THEN
    ALTER TABLE servico_pagamentos
      ALTER COLUMN data_pagamento TYPE date USING _safe_parse_fin_date(data_pagamento);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parcelas_compra'
      AND column_name = 'data_vencimento'
      AND data_type <> 'date'
  ) THEN
    ALTER TABLE parcelas_compra
      ALTER COLUMN data_vencimento TYPE date USING _safe_parse_fin_date(data_vencimento);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parcelas_compra'
      AND column_name = 'data_pagamento_cartao'
      AND data_type <> 'date'
  ) THEN
    ALTER TABLE parcelas_compra
      ALTER COLUMN data_pagamento_cartao TYPE date USING _safe_parse_fin_date(data_pagamento_cartao);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'parcelas_compra'
      AND column_name = 'data_pagamento_pessoa'
      AND data_type <> 'date'
  ) THEN
    ALTER TABLE parcelas_compra
      ALTER COLUMN data_pagamento_pessoa TYPE date USING _safe_parse_fin_date(data_pagamento_pessoa);
  END IF;
END;
$$;

DROP FUNCTION _safe_parse_fin_date(text);
DROP FUNCTION _safe_parse_fin_date(date);

COMMIT;
