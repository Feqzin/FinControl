BEGIN;

-- Normalize ownership and clean orphan records before creating constraints.
UPDATE dividas d
SET user_id = p.user_id
FROM pessoas p
WHERE d.pessoa_id = p.id
  AND d.user_id <> p.user_id;

DELETE FROM dividas d
WHERE NOT EXISTS (
  SELECT 1 FROM pessoas p WHERE p.id = d.pessoa_id
);

UPDATE parcelas p
SET user_id = d.user_id
FROM dividas d
WHERE p.divida_id = d.id
  AND p.user_id <> d.user_id;

DELETE FROM parcelas p
WHERE NOT EXISTS (
  SELECT 1 FROM dividas d WHERE d.id = p.divida_id
);

UPDATE compras_cartao c
SET user_id = ca.user_id
FROM cartoes ca
WHERE c.cartao_id = ca.id
  AND c.user_id <> ca.user_id;

DELETE FROM compras_cartao c
WHERE NOT EXISTS (
  SELECT 1 FROM cartoes ca WHERE ca.id = c.cartao_id
);

UPDATE compras_cartao c
SET pessoa_id = NULL,
    status_pessoa = NULL,
    data_pagamento_pessoa = NULL
WHERE c.pessoa_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM pessoas p
    WHERE p.id = c.pessoa_id
      AND p.user_id = c.user_id
  );

UPDATE servico_pessoas sp
SET user_id = s.user_id
FROM servicos s
WHERE sp.servico_id = s.id
  AND sp.user_id <> s.user_id;

DELETE FROM servico_pessoas sp
WHERE NOT EXISTS (
  SELECT 1
  FROM servicos s
  WHERE s.id = sp.servico_id
    AND s.user_id = sp.user_id
)
OR NOT EXISTS (
  SELECT 1
  FROM pessoas p
  WHERE p.id = sp.pessoa_id
    AND p.user_id = sp.user_id
);

UPDATE servico_pagamentos spg
SET user_id = sp.user_id
FROM servico_pessoas sp
WHERE spg.servico_pessoa_id = sp.id
  AND spg.user_id <> sp.user_id;

DELETE FROM servico_pagamentos spg
WHERE NOT EXISTS (
  SELECT 1
  FROM servico_pessoas sp
  WHERE sp.id = spg.servico_pessoa_id
    AND sp.user_id = spg.user_id
);

UPDATE parcelas_compra pc
SET user_id = c.user_id
FROM compras_cartao c
WHERE pc.compra_cartao_id = c.id
  AND pc.user_id <> c.user_id;

DELETE FROM parcelas_compra pc
WHERE NOT EXISTS (
  SELECT 1
  FROM compras_cartao c
  WHERE c.id = pc.compra_cartao_id
    AND c.user_id = pc.user_id
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pessoas_user_id') THEN
    ALTER TABLE pessoas
      ADD CONSTRAINT fk_pessoas_user_id
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dividas_user_id') THEN
    ALTER TABLE dividas
      ADD CONSTRAINT fk_dividas_user_id
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_dividas_pessoa_id') THEN
    ALTER TABLE dividas
      ADD CONSTRAINT fk_dividas_pessoa_id
      FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_parcelas_user_id') THEN
    ALTER TABLE parcelas
      ADD CONSTRAINT fk_parcelas_user_id
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_parcelas_divida_id') THEN
    ALTER TABLE parcelas
      ADD CONSTRAINT fk_parcelas_divida_id
      FOREIGN KEY (divida_id) REFERENCES dividas(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cartoes_user_id') THEN
    ALTER TABLE cartoes
      ADD CONSTRAINT fk_cartoes_user_id
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_compras_cartao_user_id') THEN
    ALTER TABLE compras_cartao
      ADD CONSTRAINT fk_compras_cartao_user_id
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_compras_cartao_cartao_id') THEN
    ALTER TABLE compras_cartao
      ADD CONSTRAINT fk_compras_cartao_cartao_id
      FOREIGN KEY (cartao_id) REFERENCES cartoes(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_compras_cartao_pessoa_id') THEN
    ALTER TABLE compras_cartao
      ADD CONSTRAINT fk_compras_cartao_pessoa_id
      FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_servicos_user_id') THEN
    ALTER TABLE servicos
      ADD CONSTRAINT fk_servicos_user_id
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_servico_pessoas_user_id') THEN
    ALTER TABLE servico_pessoas
      ADD CONSTRAINT fk_servico_pessoas_user_id
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_servico_pessoas_servico_id') THEN
    ALTER TABLE servico_pessoas
      ADD CONSTRAINT fk_servico_pessoas_servico_id
      FOREIGN KEY (servico_id) REFERENCES servicos(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_servico_pessoas_pessoa_id') THEN
    ALTER TABLE servico_pessoas
      ADD CONSTRAINT fk_servico_pessoas_pessoa_id
      FOREIGN KEY (pessoa_id) REFERENCES pessoas(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_servico_pagamentos_user_id') THEN
    ALTER TABLE servico_pagamentos
      ADD CONSTRAINT fk_servico_pagamentos_user_id
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_servico_pagamentos_servico_pessoa_id') THEN
    ALTER TABLE servico_pagamentos
      ADD CONSTRAINT fk_servico_pagamentos_servico_pessoa_id
      FOREIGN KEY (servico_pessoa_id) REFERENCES servico_pessoas(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_parcelas_compra_user_id') THEN
    ALTER TABLE parcelas_compra
      ADD CONSTRAINT fk_parcelas_compra_user_id
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_parcelas_compra_compra_id') THEN
    ALTER TABLE parcelas_compra
      ADD CONSTRAINT fk_parcelas_compra_compra_id
      FOREIGN KEY (compra_cartao_id) REFERENCES compras_cartao(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rendas_user_id') THEN
    ALTER TABLE rendas
      ADD CONSTRAINT fk_rendas_user_id
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_patrimonios_user_id') THEN
    ALTER TABLE patrimonios
      ADD CONSTRAINT fk_patrimonios_user_id
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_metas_user_id') THEN
    ALTER TABLE metas
      ADD CONSTRAINT fk_metas_user_id
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users (reset_token);

CREATE INDEX IF NOT EXISTS idx_pessoas_user_id ON pessoas (user_id);
CREATE INDEX IF NOT EXISTS idx_pessoas_user_nome ON pessoas (user_id, nome);

CREATE INDEX IF NOT EXISTS idx_dividas_user_id ON dividas (user_id);
CREATE INDEX IF NOT EXISTS idx_dividas_pessoa_id ON dividas (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_dividas_status ON dividas (status);
CREATE INDEX IF NOT EXISTS idx_dividas_data_vencimento ON dividas (data_vencimento);

CREATE INDEX IF NOT EXISTS idx_parcelas_user_id ON parcelas (user_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_divida_id ON parcelas (divida_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_status ON parcelas (status);
CREATE INDEX IF NOT EXISTS idx_parcelas_data_vencimento ON parcelas (data_vencimento);

CREATE INDEX IF NOT EXISTS idx_cartoes_user_id ON cartoes (user_id);
CREATE INDEX IF NOT EXISTS idx_cartoes_user_nome ON cartoes (user_id, nome);

CREATE INDEX IF NOT EXISTS idx_compras_cartao_user_id ON compras_cartao (user_id);
CREATE INDEX IF NOT EXISTS idx_compras_cartao_cartao_id ON compras_cartao (cartao_id);
CREATE INDEX IF NOT EXISTS idx_compras_cartao_pessoa_id ON compras_cartao (pessoa_id);
CREATE INDEX IF NOT EXISTS idx_compras_cartao_data_compra ON compras_cartao (data_compra);
CREATE INDEX IF NOT EXISTS idx_compras_cartao_status_pessoa ON compras_cartao (status_pessoa);

CREATE INDEX IF NOT EXISTS idx_servicos_user_id ON servicos (user_id);
CREATE INDEX IF NOT EXISTS idx_servicos_status ON servicos (status);
CREATE INDEX IF NOT EXISTS idx_servicos_categoria ON servicos (categoria);

CREATE INDEX IF NOT EXISTS idx_servico_pessoas_user_id ON servico_pessoas (user_id);
CREATE INDEX IF NOT EXISTS idx_servico_pessoas_servico_id ON servico_pessoas (servico_id);
CREATE INDEX IF NOT EXISTS idx_servico_pessoas_pessoa_id ON servico_pessoas (pessoa_id);

CREATE INDEX IF NOT EXISTS idx_servico_pagamentos_user_id ON servico_pagamentos (user_id);
CREATE INDEX IF NOT EXISTS idx_servico_pagamentos_sp_id ON servico_pagamentos (servico_pessoa_id);
CREATE INDEX IF NOT EXISTS idx_servico_pagamentos_mes ON servico_pagamentos (mes);

CREATE INDEX IF NOT EXISTS idx_parcelas_compra_user_id ON parcelas_compra (user_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_compra_compra_id ON parcelas_compra (compra_cartao_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_compra_numero ON parcelas_compra (numero);
CREATE INDEX IF NOT EXISTS idx_parcelas_compra_status_cartao ON parcelas_compra (status_cartao);
CREATE INDEX IF NOT EXISTS idx_parcelas_compra_status_pessoa ON parcelas_compra (status_pessoa);

CREATE INDEX IF NOT EXISTS idx_rendas_user_id ON rendas (user_id);
CREATE INDEX IF NOT EXISTS idx_rendas_ativo ON rendas (ativo);

CREATE INDEX IF NOT EXISTS idx_patrimonios_user_id ON patrimonios (user_id);
CREATE INDEX IF NOT EXISTS idx_patrimonios_tipo ON patrimonios (tipo);

CREATE INDEX IF NOT EXISTS idx_metas_user_id ON metas (user_id);
CREATE INDEX IF NOT EXISTS idx_metas_status ON metas (status);
CREATE INDEX IF NOT EXISTS idx_metas_prazo ON metas (prazo);

COMMIT;
