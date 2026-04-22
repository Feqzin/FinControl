BEGIN;

CREATE TABLE IF NOT EXISTS pessoa_saldo_movimentacoes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pessoa_id varchar NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  valor numeric(12,2) NOT NULL,
  data date NOT NULL,
  origem text NOT NULL DEFAULT 'manual',
  categoria text,
  observacao text,
  comprovante_referencia text,
  divida_id varchar REFERENCES dividas(id) ON DELETE SET NULL,
  compra_cartao_id varchar REFERENCES compras_cartao(id) ON DELETE SET NULL,
  parcela_compra_id varchar REFERENCES parcelas_compra(id) ON DELETE SET NULL,
  servico_pessoa_id varchar REFERENCES servico_pessoas(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pessoa_saldo_mov_user_id
  ON pessoa_saldo_movimentacoes (user_id);

CREATE INDEX IF NOT EXISTS idx_pessoa_saldo_mov_pessoa_id
  ON pessoa_saldo_movimentacoes (pessoa_id);

CREATE INDEX IF NOT EXISTS idx_pessoa_saldo_mov_tipo
  ON pessoa_saldo_movimentacoes (tipo);

CREATE INDEX IF NOT EXISTS idx_pessoa_saldo_mov_data
  ON pessoa_saldo_movimentacoes (data);

CREATE INDEX IF NOT EXISTS idx_pessoa_saldo_mov_divida_id
  ON pessoa_saldo_movimentacoes (divida_id);

CREATE INDEX IF NOT EXISTS idx_pessoa_saldo_mov_compra_cartao_id
  ON pessoa_saldo_movimentacoes (compra_cartao_id);

CREATE INDEX IF NOT EXISTS idx_pessoa_saldo_mov_servico_pessoa_id
  ON pessoa_saldo_movimentacoes (servico_pessoa_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_pessoa_saldo_mov_tipo'
      AND conrelid = 'pessoa_saldo_movimentacoes'::regclass
  ) THEN
    ALTER TABLE pessoa_saldo_movimentacoes
      ADD CONSTRAINT chk_pessoa_saldo_mov_tipo
      CHECK (tipo IN ('credito', 'debito'));
  END IF;
END $$;

COMMIT;
