BEGIN;

ALTER TABLE servicos
  ADD COLUMN IF NOT EXISTS compra_cartao_id varchar;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'servicos'::regclass
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) LIKE '%(compra_cartao_id)%REFERENCES compras_cartao(id)%'
  ) THEN
    ALTER TABLE servicos
      ADD CONSTRAINT fk_servicos_compra_cartao
      FOREIGN KEY (compra_cartao_id)
      REFERENCES compras_cartao(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_servicos_compra_cartao_id
  ON servicos (compra_cartao_id);

COMMIT;
