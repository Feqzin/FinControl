ALTER TABLE cnpj_das_obrigacoes
  ADD COLUMN IF NOT EXISTS total_oficial_manual boolean NOT NULL DEFAULT false;

ALTER TABLE cnpj_das_calculos
  ADD COLUMN IF NOT EXISTS total_oficial_manual boolean NOT NULL DEFAULT false;
