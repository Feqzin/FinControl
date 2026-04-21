BEGIN;

-- Step 1: normalize casing/whitespace for categorical text fields.
UPDATE pessoas
SET tipo = lower(btrim(tipo))
WHERE tipo <> lower(btrim(tipo));

UPDATE dividas
SET tipo = lower(btrim(tipo))
WHERE tipo <> lower(btrim(tipo));

UPDATE dividas
SET status = lower(btrim(status))
WHERE status <> lower(btrim(status));

UPDATE dividas
SET forma_pagamento = NULL
WHERE forma_pagamento IS NOT NULL
  AND btrim(forma_pagamento) = '';

UPDATE dividas
SET forma_pagamento = lower(btrim(forma_pagamento))
WHERE forma_pagamento IS NOT NULL
  AND forma_pagamento <> lower(btrim(forma_pagamento));

UPDATE parcelas
SET status = lower(btrim(status))
WHERE status <> lower(btrim(status));

UPDATE parcelas
SET forma_pagamento = NULL
WHERE forma_pagamento IS NOT NULL
  AND btrim(forma_pagamento) = '';

UPDATE parcelas
SET forma_pagamento = lower(btrim(forma_pagamento))
WHERE forma_pagamento IS NOT NULL
  AND forma_pagamento <> lower(btrim(forma_pagamento));

UPDATE compras_cartao
SET status_pessoa = NULL
WHERE status_pessoa IS NOT NULL
  AND btrim(status_pessoa) = '';

UPDATE compras_cartao
SET status_pessoa = lower(btrim(status_pessoa))
WHERE status_pessoa IS NOT NULL
  AND status_pessoa <> lower(btrim(status_pessoa));

UPDATE parcelas_compra
SET status_cartao = lower(btrim(status_cartao))
WHERE status_cartao <> lower(btrim(status_cartao));

UPDATE parcelas_compra
SET status_pessoa = NULL
WHERE status_pessoa IS NOT NULL
  AND btrim(status_pessoa) = '';

UPDATE parcelas_compra
SET status_pessoa = lower(btrim(status_pessoa))
WHERE status_pessoa IS NOT NULL
  AND status_pessoa <> lower(btrim(status_pessoa));

UPDATE servicos
SET categoria = lower(btrim(categoria))
WHERE categoria <> lower(btrim(categoria));

UPDATE servicos
SET forma_pagamento = lower(btrim(forma_pagamento))
WHERE forma_pagamento <> lower(btrim(forma_pagamento));

UPDATE servicos
SET status = lower(btrim(status))
WHERE status <> lower(btrim(status));

UPDATE servico_pagamentos
SET status = lower(btrim(status))
WHERE status <> lower(btrim(status));

UPDATE rendas
SET tipo = lower(btrim(tipo))
WHERE tipo <> lower(btrim(tipo));

UPDATE patrimonios
SET tipo = lower(btrim(tipo))
WHERE tipo <> lower(btrim(tipo));

UPDATE metas
SET status = lower(btrim(status))
WHERE status <> lower(btrim(status));

UPDATE import_logs
SET source_type = lower(btrim(source_type))
WHERE source_type <> lower(btrim(source_type));

UPDATE import_logs
SET status = lower(btrim(status))
WHERE status <> lower(btrim(status));

-- Step 2: normalize known aliases to canonical values.
UPDATE dividas
SET status = 'pago'
WHERE status IN ('quitado', 'quitada', 'paid', 'concluido', 'concluida', 'finalizado', 'finalizada');

UPDATE dividas
SET status = 'pendente'
WHERE status IN ('aberto', 'em_aberto', 'open', 'a_pagar', 'a_receber');

UPDATE dividas
SET status = 'parcial'
WHERE status IN ('parcialmente_pago', 'parcialmente pago', 'em_parcial', 'parcialmente');

UPDATE dividas
SET status = 'vencido'
WHERE status IN ('vencida', 'atrasado', 'atrasada');

UPDATE parcelas
SET status = 'pago'
WHERE status IN ('quitado', 'quitada', 'paid', 'concluido', 'concluida', 'finalizado', 'finalizada');

UPDATE parcelas
SET status = 'pendente'
WHERE status IN ('aberto', 'em_aberto', 'open');

UPDATE parcelas
SET status = 'parcial'
WHERE status IN ('parcialmente_pago', 'parcialmente pago', 'em_parcial', 'parcialmente');

UPDATE parcelas
SET status = 'vencido'
WHERE status IN ('vencida', 'atrasado', 'atrasada');

UPDATE compras_cartao
SET status_pessoa = 'pago'
WHERE status_pessoa IN ('quitado', 'quitada', 'paid', 'concluido', 'concluida');

UPDATE compras_cartao
SET status_pessoa = 'pendente'
WHERE status_pessoa IN ('aberto', 'em_aberto', 'open');

UPDATE compras_cartao
SET status_pessoa = 'parcial'
WHERE status_pessoa IN ('parcialmente_pago', 'parcialmente pago', 'em_parcial', 'parcialmente');

UPDATE compras_cartao
SET status_pessoa = 'vencido'
WHERE status_pessoa IN ('vencida', 'atrasado', 'atrasada');

UPDATE parcelas_compra
SET status_cartao = 'pago'
WHERE status_cartao IN ('quitado', 'quitada', 'paid', 'concluido', 'concluida');

UPDATE parcelas_compra
SET status_cartao = 'pendente'
WHERE status_cartao IN ('aberto', 'em_aberto', 'open');

UPDATE parcelas_compra
SET status_cartao = 'parcial'
WHERE status_cartao IN ('parcialmente_pago', 'parcialmente pago', 'em_parcial', 'parcialmente');

UPDATE parcelas_compra
SET status_cartao = 'vencido'
WHERE status_cartao IN ('vencida', 'atrasado', 'atrasada');

UPDATE parcelas_compra
SET status_pessoa = 'pago'
WHERE status_pessoa IN ('quitado', 'quitada', 'paid', 'concluido', 'concluida');

UPDATE parcelas_compra
SET status_pessoa = 'pendente'
WHERE status_pessoa IN ('aberto', 'em_aberto', 'open');

UPDATE parcelas_compra
SET status_pessoa = 'parcial'
WHERE status_pessoa IN ('parcialmente_pago', 'parcialmente pago', 'em_parcial', 'parcialmente');

UPDATE parcelas_compra
SET status_pessoa = 'vencido'
WHERE status_pessoa IN ('vencida', 'atrasado', 'atrasada');

UPDATE servicos
SET status = 'ativo'
WHERE status IN ('active', 'ativa', 'ligado');

UPDATE servicos
SET status = 'cancelado'
WHERE status IN ('inativo', 'inactive', 'cancelada', 'desativado', 'desativada');

UPDATE servico_pagamentos
SET status = 'pago'
WHERE status IN ('quitado', 'quitada', 'paid');

UPDATE servico_pagamentos
SET status = 'pendente'
WHERE status IN ('aberto', 'em_aberto', 'open');

UPDATE metas
SET status = 'concluida'
WHERE status IN ('concluido', 'finalizada', 'finalizado');

UPDATE metas
SET status = 'cancelada'
WHERE status IN ('cancelado', 'desativada', 'desativado');

UPDATE metas
SET status = 'ativa'
WHERE status IN ('ativo', 'aberta');

UPDATE rendas
SET tipo = 'variavel'
WHERE tipo IN ('variável');

UPDATE patrimonios
SET tipo = 'conta_bancaria'
WHERE tipo IN ('conta bancaria', 'conta corrente', 'conta');

UPDATE patrimonios
SET tipo = 'investimento'
WHERE tipo IN ('investimentos');

UPDATE patrimonios
SET tipo = 'poupanca'
WHERE tipo IN ('poupança');

UPDATE patrimonios
SET tipo = 'dinheiro'
WHERE tipo IN ('cash', 'especie', 'espécie');

UPDATE patrimonios
SET tipo = 'outros'
WHERE tipo IN ('outro');

UPDATE servicos
SET categoria = 'assinatura'
WHERE categoria IN ('assinaturas');

UPDATE servicos
SET categoria = 'streaming'
WHERE categoria IN ('stream', 'video', 'filmes');

UPDATE servicos
SET categoria = 'software'
WHERE categoria IN ('softwares', 'app', 'apps');

UPDATE servicos
SET categoria = 'utilidades'
WHERE categoria IN ('utilidade', 'contas');

UPDATE servicos
SET categoria = 'outros'
WHERE categoria IN ('outro');

UPDATE import_logs
SET status = 'failed'
WHERE status IN ('error', 'erro', 'falha', 'failed_import');

UPDATE import_logs
SET source_type = 'texto'
WHERE source_type IN ('text', 'txt');

UPDATE import_logs
SET source_type = 'manual'
WHERE source_type IN ('manualmente');

-- Canonical map for payment methods across tables.
UPDATE dividas
SET forma_pagamento = 'cartao'
WHERE forma_pagamento IN ('cartão', 'cartao de credito', 'cartao_credito', 'credito', 'crédito', 'credito_cartao');

UPDATE parcelas
SET forma_pagamento = 'cartao'
WHERE forma_pagamento IN ('cartão', 'cartao de credito', 'cartao_credito', 'credito', 'crédito', 'credito_cartao');

UPDATE servicos
SET forma_pagamento = 'cartao'
WHERE forma_pagamento IN ('cartão', 'cartao de credito', 'cartao_credito', 'credito', 'crédito', 'credito_cartao');

UPDATE dividas
SET forma_pagamento = 'debito'
WHERE forma_pagamento IN ('débito', 'debito automatico', 'débito automático');

UPDATE parcelas
SET forma_pagamento = 'debito'
WHERE forma_pagamento IN ('débito', 'debito automatico', 'débito automático');

UPDATE servicos
SET forma_pagamento = 'debito'
WHERE forma_pagamento IN ('débito', 'debito automatico', 'débito automático');

UPDATE dividas
SET forma_pagamento = 'transferencia'
WHERE forma_pagamento IN ('transferência', 'transferencia bancaria', 'transferência bancária', 'ted', 'doc');

UPDATE parcelas
SET forma_pagamento = 'transferencia'
WHERE forma_pagamento IN ('transferência', 'transferencia bancaria', 'transferência bancária', 'ted', 'doc');

UPDATE servicos
SET forma_pagamento = 'transferencia'
WHERE forma_pagamento IN ('transferência', 'transferencia bancaria', 'transferência bancária', 'ted', 'doc');

UPDATE dividas
SET forma_pagamento = 'dinheiro'
WHERE forma_pagamento IN ('especie', 'espécie', 'cash');

UPDATE parcelas
SET forma_pagamento = 'dinheiro'
WHERE forma_pagamento IN ('especie', 'espécie', 'cash');

UPDATE servicos
SET forma_pagamento = 'dinheiro'
WHERE forma_pagamento IN ('especie', 'espécie', 'cash');

COMMIT;
