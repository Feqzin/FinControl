CREATE TABLE IF NOT EXISTS cnpj_das_importacoes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cnpj_id varchar NOT NULL REFERENCES cnpjs(id) ON DELETE CASCADE,
  data_calculo date NOT NULL,
  competencia_inicial date NOT NULL,
  competencia_final date NOT NULL,
  quantidade_competencias integer NOT NULL,
  total numeric(12, 2) NOT NULL,
  comprovante_path text,
  comprovante_nome text,
  comprovante_mime_type text,
  comprovante_tamanho integer,
  comprovante_enviado_em timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cnpj_das_importacoes_user_id
  ON cnpj_das_importacoes(user_id);

CREATE INDEX IF NOT EXISTS idx_cnpj_das_importacoes_cnpj_id
  ON cnpj_das_importacoes(cnpj_id);

CREATE INDEX IF NOT EXISTS idx_cnpj_das_importacoes_created_at
  ON cnpj_das_importacoes(created_at);

ALTER TABLE cnpj_das_calculos
  ADD COLUMN IF NOT EXISTS importacao_id varchar REFERENCES cnpj_das_importacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cnpj_das_calculos_importacao_id
  ON cnpj_das_calculos(importacao_id);
