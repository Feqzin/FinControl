BEGIN;

UPDATE servicos
SET categoria = 'cuidados_pessoais'
WHERE lower(btrim(categoria)) IN ('cuidados pessoais', 'cuidados-pessoais', 'cuidados_pessoais');

ALTER TABLE servicos DROP CONSTRAINT IF EXISTS ck_servicos_categoria_domain;

ALTER TABLE servicos
  ADD CONSTRAINT ck_servicos_categoria_domain
  CHECK (categoria IN ('streaming', 'software', 'lazer', 'assinatura', 'utilidades', 'outros', 'cuidados_pessoais'));

COMMIT;
