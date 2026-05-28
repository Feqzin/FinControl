import test from "node:test";
import assert from "node:assert/strict";
import { parseBackupJsonImport } from "../../validators/backup-import.validators.js";
import { transformBackupForPersistence } from "../../services/backup-import-transform.service.js";
import { resolveServicoBackupBillingFields } from "../../services/backup-import-servicos.utils.js";

test("backup/import servicos: preserva periodicidade e valor de cobranca no parse+transform", () => {
  const parsed = parseBackupJsonImport({
    exportadoEm: "2026-05-18T12:00:00.000Z",
    usuario: "demo",
    pessoas: [],
    dividas: [],
    cartoes: [
      {
        id: "cartao-old-1",
        userId: "legacy-user",
        nome: "Nubank",
        limite: "5000.00",
        melhorDiaCompra: 10,
        diaVencimento: 17,
      },
    ],
    compras: [
      {
        id: "compra-old-1",
        userId: "legacy-user",
        cartaoId: "cartao-old-1",
        descricao: "Distrokid Assinatura",
        valorTotal: "229.82",
        parcelas: 1,
        parcelaAtual: 1,
        valorParcela: "229.82",
        dataCompra: "2026-05-14",
      },
    ],
    parcelasCompra: [],
    servicos: [
      {
        id: "servico-old-1",
        userId: "legacy-user",
        nome: "Distrokid",
        categoria: "assinatura",
        valorMensal: "19.15",
        valorCobranca: "229.82",
        periodicidadeCobranca: "anual",
        dataCobranca: 14,
        formaPagamento: "cartao",
        compraCartaoId: "compra-old-1",
        status: "ativo",
      },
    ],
    servicoPessoas: [],
    servicoPagamentos: [],
    pessoaSaldoMovimentacoes: [],
    metas: [],
  });

  const transformed = transformBackupForPersistence(parsed, "user-target");
  const transformedServico = transformed.servicos[0] as Record<string, unknown>;

  assert.equal(transformedServico.periodicidadeCobranca, "anual");
  assert.equal(transformedServico.valorCobranca, "229.82");
  assert.equal(transformedServico.valorMensal, "19.15");
  assert.equal(transformedServico.userId, "user-target");
  assert.equal(
    transformedServico.compraCartaoId,
    transformed.idMaps.oldCompraIdToNewCompraId["compra-old-1"],
  );
});

test("backup/import servicos: compatibilidade com backup antigo sem periodicidade/valorCobranca", () => {
  const resolved = resolveServicoBackupBillingFields(
    {
      valorMensal: "59.90",
      valorCobranca: null,
      periodicidadeCobranca: null,
    },
    "servicos[0]",
  );

  assert.equal(resolved.periodicidadeCobranca, "mensal");
  assert.equal(resolved.valorMensal, "59.90");
  assert.equal(resolved.valorCobranca, "59.90");
});

test("backup/import servicos: restaura backup novo com valorCobranca sem depender de valorMensal legado", () => {
  const resolved = resolveServicoBackupBillingFields(
    {
      valorMensal: null,
      valorCobranca: "229.82",
      periodicidadeCobranca: "anual",
    },
    "servicos[0]",
  );

  assert.equal(resolved.periodicidadeCobranca, "anual");
  assert.equal(resolved.valorCobranca, "229.82");
  assert.equal(resolved.valorMensal, "19.15");
});

test("backup/import servicos: aceita serviço sem data fixa e preserva dataCobranca nula", () => {
  const parsed = parseBackupJsonImport({
    exportadoEm: "2026-05-27T12:00:00.000Z",
    usuario: "demo",
    pessoas: [],
    dividas: [],
    cartoes: [],
    compras: [],
    parcelasCompra: [],
    servicos: [
      {
        id: "servico-sem-data",
        userId: "legacy-user",
        nome: "Cabeleireiro",
        categoria: "cuidados_pessoais",
        valorMensal: "195.00",
        valorCobranca: "45.00",
        periodicidadeCobranca: "semanal",
        dataCobranca: null,
        formaPagamento: "pix",
        compraCartaoId: null,
        status: "ativo",
      },
    ],
    servicoPessoas: [],
    servicoPagamentos: [],
    pessoaSaldoMovimentacoes: [],
    metas: [],
  });

  const transformed = transformBackupForPersistence(parsed, "user-target");
  const transformedServico = transformed.servicos[0] as Record<string, unknown>;
  assert.equal(transformedServico.dataCobranca, null);
});

test("backup/import pessoas: preserva deletedAt quando presente e mantém compatibilidade sem campo", () => {
  const parsed = parseBackupJsonImport({
    exportadoEm: "2026-05-28T10:00:00.000Z",
    usuario: "demo",
    pessoas: [
      {
        id: "pessoa-old-1",
        userId: "legacy-user",
        nome: "Pessoa ativa",
        tipo: "me_deve",
        telefone: null,
        observacao: null,
      },
      {
        id: "pessoa-old-2",
        userId: "legacy-user",
        nome: "Pessoa removida",
        tipo: "eu_devo",
        telefone: null,
        observacao: null,
        deletedAt: "2026-04-01T12:00:00.000Z",
      },
    ],
    dividas: [],
    cartoes: [],
    compras: [],
    parcelasCompra: [],
    servicos: [],
    servicoPessoas: [],
    servicoPagamentos: [],
    pessoaSaldoMovimentacoes: [],
    metas: [],
  });

  const transformed = transformBackupForPersistence(parsed, "user-target");
  const pessoaAtiva = transformed.pessoas[0] as Record<string, unknown>;
  const pessoaRemovida = transformed.pessoas[1] as Record<string, unknown>;

  assert.equal(pessoaAtiva.deletedAt ?? null, null);
  assert.equal(pessoaRemovida.deletedAt, "2026-04-01T12:00:00.000Z");
});

test("backup/import dívidas: preserva deletedAt quando presente e mantém compatibilidade sem campo", () => {
  const parsed = parseBackupJsonImport({
    exportadoEm: "2026-05-28T10:00:00.000Z",
    usuario: "demo",
    pessoas: [
      {
        id: "pessoa-old-1",
        userId: "legacy-user",
        nome: "Pessoa base",
        tipo: "me_deve",
        telefone: null,
        observacao: null,
      },
    ],
    dividas: [
      {
        id: "divida-old-1",
        userId: "legacy-user",
        pessoaId: "pessoa-old-1",
        tipo: "receber",
        valor: "50.00",
        dataVencimento: "2026-05-15",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
        descricao: "Dívida ativa",
      },
      {
        id: "divida-old-2",
        userId: "legacy-user",
        pessoaId: "pessoa-old-1",
        tipo: "pagar",
        valor: "80.00",
        dataVencimento: "2026-04-10",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
        descricao: "Dívida removida",
        deletedAt: "2026-04-20T12:00:00.000Z",
      },
    ],
    cartoes: [],
    compras: [],
    parcelasCompra: [],
    servicos: [],
    servicoPessoas: [],
    servicoPagamentos: [],
    pessoaSaldoMovimentacoes: [],
    metas: [],
  });

  const transformed = transformBackupForPersistence(parsed, "user-target");
  const dividaAtiva = transformed.dividas[0] as Record<string, unknown>;
  const dividaRemovida = transformed.dividas[1] as Record<string, unknown>;

  assert.equal(dividaAtiva.deletedAt ?? null, null);
  assert.equal(dividaRemovida.deletedAt, "2026-04-20T12:00:00.000Z");
});
