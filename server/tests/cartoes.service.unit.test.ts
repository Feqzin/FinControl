import test from "node:test";
import assert from "node:assert/strict";
import { CartoesService } from "../services/cartoes.service";

test("CartoesService.create inclui userId e preserva payload de cartao", async () => {
  let createPayload: Record<string, unknown> | null = null;

  const repository = {
    createCartao: async (payload: Record<string, unknown>) => {
      createPayload = payload;
      return {
        id: "cartao-1",
        ...payload,
        iconeId: null,
      };
    },
  } as any;

  const service = new CartoesService(repository);
  const created = await service.create("user-1", {
    nome: "Cartao XPTO",
    limite: "5000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
  });

  assert.deepEqual(createPayload, {
    userId: "user-1",
    nome: "Cartao XPTO",
    limite: "5000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
  });
  assert.equal(created.id, "cartao-1");
  assert.equal(created.userId, "user-1");
});

test("CartoesService.update e delete delegam para repository sem alterar retorno", async () => {
  const repository = {
    updateCartao: async () => undefined,
    deleteCartao: async () => false,
  } as any;

  const service = new CartoesService(repository);
  const updated = await service.update("cartao-404", "user-1", { nome: "Novo nome" });
  const deleted = await service.delete("cartao-404", "user-1");

  assert.equal(updated, undefined);
  assert.equal(deleted, false);
});

test("CartoesService.registerInvoicePayment registra pagamento parcial sem quitar parcelas nem alterar reembolso", async () => {
  const userId = "user-1";
  const currentMonth = "2026-06";
  const cartao = {
    id: "cartao-1",
    userId,
    nome: "Nubank",
    limite: "1000.00",
    melhorDiaCompra: 5,
    diaVencimento: 20,
    iconeId: null,
  };
  const compras = [
    {
      id: "compra-atual",
      userId,
      cartaoId: cartao.id,
      descricao: "Compra atual",
      valorTotal: "200.00",
      parcelas: 2,
      parcelaAtual: 1,
      valorParcela: "100.00",
      dataCompra: "2026-06-01",
      pessoaId: "pessoa-1",
      statusPessoa: "pendente",
      dataPagamentoPessoa: null,
    },
  ];
  const parcelasCompra = [
    {
      id: "parcela-atual-1",
      userId,
      compraCartaoId: "compra-atual",
      numero: 1,
      valor: "100.00",
      dataVencimento: "2026-06-10",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: "pendente",
      dataPagamentoPessoa: null,
    },
    {
      id: "parcela-atual-2",
      userId,
      compraCartaoId: "compra-atual",
      numero: 2,
      valor: "100.00",
      dataVencimento: "2026-06-20",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: "pendente",
      dataPagamentoPessoa: null,
    },
  ];
  const pagamentos: any[] = [];
  const alocacoes: any[] = [];

  const repository = {
    getCartao: async () => cartao,
    getComprasByCartao: async () => compras,
    getParcelasCompra: async (compraId: string) => parcelasCompra.filter((item) => item.compraCartaoId === compraId),
    getParcelasCompraByUser: async () => parcelasCompra,
    getCartaoFaturaPagamentos: async () => pagamentos,
    getCartaoFaturaPagamentosByCartao: async () => pagamentos,
    getCartaoFaturaPagamentoAlocacoesByPagamentoIds: async (paymentIds: string[]) => (
      alocacoes.filter((item) => paymentIds.includes(item.pagamentoId))
    ),
    getCompraCartao: async (compraId: string) => compras.find((item) => item.id === compraId),
    updateCompraCartao: async (compraId: string, _userId: string, patch: Record<string, unknown>) => {
      const compra = compras.find((item) => item.id === compraId);
      if (!compra) return undefined;
      Object.assign(compra, patch);
      return compra;
    },
    updateParcelaCompra: async (parcelaId: string, _userId: string, patch: Record<string, unknown>) => {
      const parcela = parcelasCompra.find((item) => item.id === parcelaId);
      if (!parcela) return undefined;
      Object.assign(parcela, patch);
      return parcela;
    },
    createCartaoFaturaPagamento: async (payload: Record<string, unknown>) => {
      const created = {
        id: `payment-${pagamentos.length + 1}`,
        createdAt: "2026-06-15T12:00:00.000Z",
        updatedAt: "2026-06-15T12:00:00.000Z",
        ...payload,
      };
      pagamentos.push(created);
      return created;
    },
    createCartaoFaturaPagamentoAlocacoesBulk: async (payloads: Array<Record<string, unknown>>) => {
      const created = payloads.map((payload, index) => ({
        id: `allocation-${alocacoes.length + index + 1}`,
        createdAt: "2026-06-15T12:00:00.000Z",
        updatedAt: "2026-06-15T12:00:00.000Z",
        ...payload,
      }));
      alocacoes.push(...created);
      return created;
    },
    updateCartaoFaturaPagamento: async () => undefined,
  } as any;

  const service = new CartoesService(repository);
  const result = await service.registerInvoicePayment(userId, cartao.id, currentMonth, {
    valorPago: "80.00",
    dataPagamento: "2026-06-15",
    observacao: "Pagamento parcial",
  });

  assert.equal(result.valorAplicado, 80);
  assert.equal(result.saldoAnterior, 200);
  assert.equal(result.saldoRestante, 120);
  assert.equal(result.statusFatura, "parcialmente_paga");
  assert.equal(pagamentos.length, 1);
  assert.equal(alocacoes.length, 1);
  assert.equal(pagamentos[0]?.tipoPagamento, "parcial");
  assert.equal(pagamentos[0]?.modoAlocacao, "ordem_fatura");
  assert.equal(pagamentos[0]?.considerarNoSaldoCompetencia, true);
  assert.equal(alocacoes[0]?.parcelaCompraId, "parcela-atual-1");
  assert.equal(alocacoes[0]?.valorAplicado, "80.00");
  assert.equal(parcelasCompra.every((parcela) => parcela.statusCartao === "pendente"), true);
  assert.equal(parcelasCompra.every((parcela) => parcela.statusPessoa === "pendente"), true);
});

test("CartoesService.registerInvoicePayment quita apenas a competência atual, limita excesso e preserva reembolso pendente", async () => {
  const userId = "user-1";
  const currentMonth = "2026-06";
  const cartao = {
    id: "cartao-1",
    userId,
    nome: "Nubank",
    limite: "1000.00",
    melhorDiaCompra: 5,
    diaVencimento: 20,
    iconeId: null,
  };
  const compras = [
    {
      id: "compra-atual",
      userId,
      cartaoId: cartao.id,
      descricao: "Compra atual",
      valorTotal: "200.00",
      parcelas: 2,
      parcelaAtual: 1,
      valorParcela: "100.00",
      dataCompra: "2026-06-01",
      pessoaId: "pessoa-1",
      statusPessoa: "pendente",
      dataPagamentoPessoa: null,
    },
    {
      id: "compra-futura",
      userId,
      cartaoId: cartao.id,
      descricao: "Compra futura",
      valorTotal: "90.00",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "90.00",
      dataCompra: "2026-07-01",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
  ];
  const parcelasCompra = [
    {
      id: "parcela-atual-1",
      userId,
      compraCartaoId: "compra-atual",
      numero: 1,
      valor: "100.00",
      dataVencimento: "2026-06-10",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: "pendente",
      dataPagamentoPessoa: null,
    },
    {
      id: "parcela-atual-2",
      userId,
      compraCartaoId: "compra-atual",
      numero: 2,
      valor: "100.00",
      dataVencimento: "2026-06-20",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: "pendente",
      dataPagamentoPessoa: null,
    },
    {
      id: "parcela-futura-1",
      userId,
      compraCartaoId: "compra-futura",
      numero: 1,
      valor: "90.00",
      dataVencimento: "2026-07-10",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
  ];
  const pagamentos: any[] = [
    {
      id: "payment-partial-existing",
      userId,
      cartaoId: cartao.id,
      competenciaAno: 2026,
      competenciaMes: 6,
      valorPago: "50.00",
      dataPagamento: "2026-06-12",
      observacao: null,
      tipoPagamento: "parcial",
      considerarNoSaldoCompetencia: true,
      conciliadoEm: null,
      createdAt: "2026-06-12T12:00:00.000Z",
      updatedAt: "2026-06-12T12:00:00.000Z",
    },
  ];
  const alocacoes: any[] = [];

  const repository = {
    getCartao: async () => cartao,
    getComprasByCartao: async () => compras,
    getParcelasCompra: async (compraId: string) => parcelasCompra.filter((item) => item.compraCartaoId === compraId),
    getParcelasCompraByUser: async () => parcelasCompra,
    getCartaoFaturaPagamentos: async () => pagamentos,
    getCartaoFaturaPagamentosByCartao: async () => pagamentos,
    getCartaoFaturaPagamentoAlocacoesByPagamentoIds: async (paymentIds: string[]) => (
      alocacoes.filter((item) => paymentIds.includes(item.pagamentoId))
    ),
    getCompraCartao: async (compraId: string) => compras.find((item) => item.id === compraId),
    updateCompraCartao: async (compraId: string, _userId: string, patch: Record<string, unknown>) => {
      const compra = compras.find((item) => item.id === compraId);
      if (!compra) return undefined;
      Object.assign(compra, patch);
      return compra;
    },
    updateParcelaCompra: async (parcelaId: string, _userId: string, patch: Record<string, unknown>) => {
      const parcela = parcelasCompra.find((item) => item.id === parcelaId);
      if (!parcela) return undefined;
      Object.assign(parcela, patch);
      return parcela;
    },
    createCartaoFaturaPagamento: async (payload: Record<string, unknown>) => {
      const created = {
        id: `payment-${pagamentos.length + 1}`,
        createdAt: "2026-06-18T12:00:00.000Z",
        updatedAt: "2026-06-18T12:00:00.000Z",
        ...payload,
      };
      pagamentos.push(created);
      return created;
    },
    createCartaoFaturaPagamentoAlocacoesBulk: async (payloads: Array<Record<string, unknown>>) => {
      const created = payloads.map((payload, index) => ({
        id: `allocation-${alocacoes.length + index + 1}`,
        createdAt: "2026-06-18T12:00:00.000Z",
        updatedAt: "2026-06-18T12:00:00.000Z",
        ...payload,
      }));
      alocacoes.push(...created);
      return created;
    },
    updateCartaoFaturaPagamento: async (paymentId: string, _userId: string, patch: Record<string, unknown>) => {
      const pagamento = pagamentos.find((item) => item.id === paymentId);
      if (!pagamento) return undefined;
      Object.assign(pagamento, patch);
      return pagamento;
    },
  } as any;

  const service = new CartoesService(repository);
  const result = await service.registerInvoicePayment(userId, cartao.id, currentMonth, {
    valorPago: "999.00",
    dataPagamento: "2026-06-18",
    observacao: "Quitar fatura vencida",
  });

  assert.equal(result.valorSolicitado, 999);
  assert.equal(result.valorAplicado, 150);
  assert.equal(result.saldoAnterior, 150);
  assert.equal(result.saldoRestante, 0);
  assert.equal(result.statusFatura, "paga");

  const parcelasAtualizadasMesAtual = parcelasCompra.filter((parcela) => parcela.dataVencimento.startsWith("2026-06"));
  assert.equal(parcelasAtualizadasMesAtual.every((parcela) => parcela.statusCartao === "pago"), true);
  assert.equal(parcelasAtualizadasMesAtual.every((parcela) => parcela.dataPagamentoCartao === "2026-06-18"), true);
  assert.equal(parcelasAtualizadasMesAtual.every((parcela) => parcela.statusPessoa === "pendente"), true);

  const parcelaFutura = parcelasCompra.find((parcela) => parcela.id === "parcela-futura-1");
  assert.equal(parcelaFutura?.statusCartao, "pendente");

  const pagamentoParcialAnterior = pagamentos.find((pagamento) => pagamento.id === "payment-partial-existing");
  assert.equal(pagamentoParcialAnterior?.considerarNoSaldoCompetencia, false);
  assert.ok(pagamentoParcialAnterior?.conciliadoEm);

  const pagamentoQuitacao = pagamentos.find((pagamento) => pagamento.tipoPagamento === "quitacao_total");
  assert.equal(pagamentoQuitacao?.valorPago, "150.00");
  assert.equal(alocacoes.filter((alocacao) => alocacao.pagamentoId === pagamentoQuitacao?.id).length, 2);
  assert.equal(pagamentoQuitacao?.considerarNoSaldoCompetencia, false);
});

function createAllocationModeScenario() {
  const userId = "user-allocation-modes";
  const currentMonth = "2026-06";
  const cartao = {
    id: "cartao-allocation",
    userId,
    nome: "Nubank",
    limite: "2000.00",
    melhorDiaCompra: 5,
    diaVencimento: 20,
    iconeId: null,
  };
  const compras = [
    {
      id: "compra-adobe",
      userId,
      cartaoId: cartao.id,
      descricao: "Adobe",
      valorTotal: "102.97",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "102.97",
      dataCompra: "2026-06-01",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
    {
      id: "compra-raia",
      userId,
      cartaoId: cartao.id,
      descricao: "Raia",
      valorTotal: "31.78",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "31.78",
      dataCompra: "2026-06-02",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
    {
      id: "compra-iof",
      userId,
      cartaoId: cartao.id,
      descricao: "IOF",
      valorTotal: "4.88",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "4.88",
      dataCompra: "2026-06-03",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
    {
      id: "compra-replit",
      userId,
      cartaoId: cartao.id,
      descricao: "Replit",
      valorTotal: "139.43",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "139.43",
      dataCompra: "2026-06-04",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
  ];
  const parcelasCompra = [
    {
      id: "parcela-adobe",
      userId,
      compraCartaoId: "compra-adobe",
      numero: 1,
      valor: "102.97",
      dataVencimento: "2026-06-10",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
    {
      id: "parcela-raia",
      userId,
      compraCartaoId: "compra-raia",
      numero: 1,
      valor: "31.78",
      dataVencimento: "2026-06-11",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
    {
      id: "parcela-iof",
      userId,
      compraCartaoId: "compra-iof",
      numero: 1,
      valor: "4.88",
      dataVencimento: "2026-06-12",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
    {
      id: "parcela-replit",
      userId,
      compraCartaoId: "compra-replit",
      numero: 1,
      valor: "139.43",
      dataVencimento: "2026-06-13",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
  ];
  const pagamentos: any[] = [];
  const alocacoes: any[] = [];

  const repository = {
    getCartao: async () => cartao,
    getComprasByCartao: async () => compras,
    getParcelasCompra: async (compraId: string) => parcelasCompra.filter((item) => item.compraCartaoId === compraId),
    getParcelasCompraByUser: async () => parcelasCompra,
    getCartaoFaturaPagamentos: async () => pagamentos,
    getCartaoFaturaPagamentosByCartao: async () => pagamentos,
    getCartaoFaturaPagamentoAlocacoesByPagamentoIds: async (paymentIds: string[]) => (
      alocacoes.filter((item) => paymentIds.includes(item.pagamentoId))
    ),
    getCompraCartao: async (compraId: string) => compras.find((item) => item.id === compraId),
    updateCompraCartao: async (compraId: string, _userId: string, patch: Record<string, unknown>) => {
      const compra = compras.find((item) => item.id === compraId);
      if (!compra) return undefined;
      Object.assign(compra, patch);
      return compra;
    },
    updateParcelaCompra: async (parcelaId: string, _userId: string, patch: Record<string, unknown>) => {
      const parcela = parcelasCompra.find((item) => item.id === parcelaId);
      if (!parcela) return undefined;
      Object.assign(parcela, patch);
      return parcela;
    },
    createCartaoFaturaPagamento: async (payload: Record<string, unknown>) => {
      const created = {
        id: `payment-${pagamentos.length + 1}`,
        createdAt: "2026-06-15T12:00:00.000Z",
        updatedAt: "2026-06-15T12:00:00.000Z",
        ...payload,
      };
      pagamentos.push(created);
      return created;
    },
    createCartaoFaturaPagamentoAlocacoesBulk: async (payloads: Array<Record<string, unknown>>) => {
      const created = payloads.map((payload, index) => ({
        id: `allocation-${alocacoes.length + index + 1}`,
        createdAt: "2026-06-15T12:00:00.000Z",
        updatedAt: "2026-06-15T12:00:00.000Z",
        ...payload,
      }));
      alocacoes.push(...created);
      return created;
    },
    updateCartaoFaturaPagamento: async () => undefined,
  } as any;

  return {
    service: new CartoesService(repository),
    userId,
    currentMonth,
    cartaoId: cartao.id,
    alocacoes,
  };
}

test("CartoesService.registerInvoicePayment aplica modo menores_primeiro quitando parcelas menores antes", async () => {
  const scenario = createAllocationModeScenario();

  await scenario.service.registerInvoicePayment(scenario.userId, scenario.cartaoId, scenario.currentMonth, {
    valorPago: "200.00",
    dataPagamento: "2026-06-15",
    modoAlocacao: "menores_primeiro",
  });

  assert.deepEqual(
    scenario.alocacoes.map((alocacao) => [alocacao.parcelaCompraId, alocacao.valorAplicado]),
    [
      ["parcela-iof", "4.88"],
      ["parcela-raia", "31.78"],
      ["parcela-adobe", "102.97"],
      ["parcela-replit", "60.37"],
    ],
  );
});

test("CartoesService.registerInvoicePayment aplica modo maiores_primeiro amortizando as maiores primeiro", async () => {
  const scenario = createAllocationModeScenario();

  await scenario.service.registerInvoicePayment(scenario.userId, scenario.cartaoId, scenario.currentMonth, {
    valorPago: "200.00",
    dataPagamento: "2026-06-15",
    modoAlocacao: "maiores_primeiro",
  });

  assert.deepEqual(
    scenario.alocacoes.map((alocacao) => [alocacao.parcelaCompraId, alocacao.valorAplicado]),
    [
      ["parcela-replit", "139.43"],
      ["parcela-adobe", "60.57"],
    ],
  );
});

test("CartoesService.registerInvoicePayment aplica modo manual somente nas parcelas escolhidas", async () => {
  const scenario = createAllocationModeScenario();

  const result = await scenario.service.registerInvoicePayment(scenario.userId, scenario.cartaoId, scenario.currentMonth, {
    valorPago: "150.00",
    dataPagamento: "2026-06-15",
    modoAlocacao: "manual",
    aplicarRestanteAutomaticamente: false,
    alocacoesManuais: [
      { parcelaCompraId: "parcela-adobe" },
      { parcelaCompraId: "parcela-replit" },
    ],
  });

  assert.equal(result.valorAplicado, 150);
  assert.deepEqual(
    scenario.alocacoes.map((alocacao) => [alocacao.parcelaCompraId, alocacao.valorAplicado]),
    [
      ["parcela-adobe", "102.97"],
      ["parcela-replit", "47.03"],
    ],
  );
});

test("CartoesService.registerInvoicePayment bloqueia modo manual com sobra sem aplicacao automatica", async () => {
  const scenario = createAllocationModeScenario();

  const result = await scenario.service.registerInvoicePayment(scenario.userId, scenario.cartaoId, scenario.currentMonth, {
    valorPago: "50.00",
    dataPagamento: "2026-06-15",
    modoAlocacao: "manual",
    aplicarRestanteAutomaticamente: false,
    alocacoesManuais: [
      { parcelaCompraId: "parcela-iof" },
    ],
  });

  assert.deepEqual(result, {
    error: "ALOCACAO_INVALIDA",
    message: "O valor informado é maior que a soma das parcelas selecionadas. Ative a aplicação automática do restante ou ajuste a seleção manual.",
  });
});
