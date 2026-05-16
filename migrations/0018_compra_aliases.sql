BEGIN;

CREATE TABLE IF NOT EXISTS compra_aliases (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  compra_cartao_id varchar NOT NULL REFERENCES compras_cartao(id) ON DELETE CASCADE,
  cartao_id varchar REFERENCES cartoes(id) ON DELETE SET NULL,
  nome_original text,
  nome_importado text NOT NULL,
  nome_normalizado text NOT NULL,
  issuer text,
  parser_used text,
  card_last4 varchar(4),
  valor_parcela numeric(12, 2),
  total_parcelas integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compra_aliases_user_id
  ON compra_aliases (user_id);

CREATE INDEX IF NOT EXISTS idx_compra_aliases_compra_cartao_id
  ON compra_aliases (compra_cartao_id);

CREATE INDEX IF NOT EXISTS idx_compra_aliases_cartao_id
  ON compra_aliases (cartao_id);

CREATE INDEX IF NOT EXISTS idx_compra_aliases_nome_normalizado
  ON compra_aliases (nome_normalizado);

CREATE INDEX IF NOT EXISTS idx_compra_aliases_issuer
  ON compra_aliases (issuer);

CREATE INDEX IF NOT EXISTS idx_compra_aliases_created_at
  ON compra_aliases (created_at);

COMMIT;
