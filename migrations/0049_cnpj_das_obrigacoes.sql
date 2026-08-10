ALTER TABLE dividas
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_dividas_user_origem
  ON dividas(user_id, origem);

CREATE TABLE IF NOT EXISTS cnpjs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pessoa_id varchar NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
  cnpj varchar(14) NOT NULL,
  nome text NOT NULL,
  regime text NOT NULL DEFAULT 'mei',
  atividade_mei text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ck_cnpjs_regime CHECK (regime = 'mei'),
  CONSTRAINT ck_cnpjs_atividade_mei CHECK (atividade_mei IN ('comercio', 'servico', 'comercio_servico')),
  CONSTRAINT ck_cnpjs_digits CHECK (cnpj ~ '^[0-9]{14}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cnpjs_user_cnpj_unique ON cnpjs(user_id, cnpj);
CREATE INDEX IF NOT EXISTS idx_cnpjs_user_id ON cnpjs(user_id);
CREATE INDEX IF NOT EXISTS idx_cnpjs_pessoa_id ON cnpjs(pessoa_id);

CREATE TABLE IF NOT EXISTS cnpj_das_obrigacoes (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cnpj_id varchar NOT NULL REFERENCES cnpjs(id) ON DELETE CASCADE,
  divida_id varchar NOT NULL REFERENCES dividas(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  data_vencimento date NOT NULL,
  data_calculo date NOT NULL,
  principal numeric(12, 2) NOT NULL,
  multa_percentual numeric(8, 4) NOT NULL DEFAULT 0,
  multa_valor numeric(12, 2) NOT NULL DEFAULT 0,
  juros_percentual numeric(8, 4) NOT NULL DEFAULT 0,
  juros_valor numeric(12, 2) NOT NULL DEFAULT 0,
  total numeric(12, 2) NOT NULL,
  beneficio_inss boolean NOT NULL DEFAULT false,
  principal_manual boolean NOT NULL DEFAULT false,
  vencimento_manual boolean NOT NULL DEFAULT false,
  selic_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT ck_cnpj_das_competencia_primeiro_dia CHECK (EXTRACT(DAY FROM competencia) = 1),
  CONSTRAINT ck_cnpj_das_valores_positivos CHECK (
    principal >= 0 AND multa_valor >= 0 AND juros_valor >= 0 AND total >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cnpj_das_obrigacoes_divida_unique
  ON cnpj_das_obrigacoes(divida_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cnpj_das_obrigacoes_competencia_unique
  ON cnpj_das_obrigacoes(cnpj_id, competencia);
CREATE INDEX IF NOT EXISTS idx_cnpj_das_obrigacoes_user_id ON cnpj_das_obrigacoes(user_id);
CREATE INDEX IF NOT EXISTS idx_cnpj_das_obrigacoes_cnpj_id ON cnpj_das_obrigacoes(cnpj_id);

CREATE TABLE IF NOT EXISTS cnpj_das_calculos (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  obrigacao_id varchar NOT NULL REFERENCES cnpj_das_obrigacoes(id) ON DELETE CASCADE,
  data_calculo date NOT NULL,
  principal numeric(12, 2) NOT NULL,
  multa_percentual numeric(8, 4) NOT NULL,
  multa_valor numeric(12, 2) NOT NULL,
  juros_percentual numeric(8, 4) NOT NULL,
  juros_valor numeric(12, 2) NOT NULL,
  total numeric(12, 2) NOT NULL,
  selic_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cnpj_das_calculos_obrigacao_id
  ON cnpj_das_calculos(obrigacao_id);
CREATE INDEX IF NOT EXISTS idx_cnpj_das_calculos_user_data
  ON cnpj_das_calculos(user_id, data_calculo);
