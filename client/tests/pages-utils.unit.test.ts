import test from "node:test";
import assert from "node:assert/strict";
import { addMonths, format } from "date-fns";
import { formatCurrencyBRL, formatIsoDateToBR } from "../src/utils/formatters";
import {
  buildDividasViewItems,
  filterDividasViewItems,
  isOverdueDate,
  sortDividasForView,
  sortDividasViewItems,
} from "../src/pages/dividas/dividas.utils";
import { sortPessoasForView } from "../src/pages/pessoas/pessoas-sort.utils";
import { sortServicosForView } from "../src/pages/servicos/servicos-sort.utils";
import { getDaysUntilInvoice, getNextInvoiceDate, isParcelaVencida } from "../src/pages/cartoes/cartoes.utils";
import {
  detectInvoiceIssuerForPdfText,
  detectItauInvoiceText,
  detectMercadoPagoInvoiceText,
  detectRecurringServiceCandidate,
  detectNubankInvoiceText,
  extractNubankInvoiceYear,
  getPlannedInvoiceIssuers,
  getRegisteredInvoiceParsers,
  parseCsv,
  parseItauInvoiceText,
  parseMercadoPagoInvoiceText,
  parseOfx,
  parseNubankInvoiceText,
  parsePdf,
} from "../src/pages/cartoes/import-parser";
import { suggestImportCardByText } from "../src/pages/cartoes/import-card-matching";
import { parseMoneyLikeValue, resolveReembolsoPreview } from "../src/components/cartoes/CompraCartaoDialog";
import type { Cartao, CompraCartao, Divida, Parcela, ParcelaCompra, Pessoa, Servico } from "@shared/schema";
import {
  extractTextFromPdfBuffer,
  hasPdfMagicBytes,
  isExtractedPdfTextUsable,
  reconstructPdfLinesByPosition,
} from "../src/pages/cartoes/import-pdf-utils";
import { buildRelatorioPdfMetadata } from "../src/pages/relatorios/relatorios-pdf-utils";
import { formatMoneyFixed } from "../src/lib/money";
import {
  calculateCardInvoiceForCompetency,
  calculateCardCurrentInvoiceTotal,
  calculateCardUsedLimit,
  compraHasInstallmentInCompetency,
  compraHasOpenInstallmentInMonth,
  filterParcelasByCompetency,
  getInvoiceCompetency,
  groupParcelasCompraByCompraId,
} from "../src/lib/card-limit-usage";
import {
  buildTimelineLayout,
  findSelectedTimelineEvent,
  formatBytes,
  getTimelineCanvasWidth,
  getTimelineStatusVisual,
  getTimelineEventKey,
  toTimelineDateLabel,
} from "../src/pages/pessoas/payment-timeline.utils";
import { buildCompraAliasDraft, findPossibleExistingPurchaseMatch } from "../src/pages/cartoes/import-existing-purchase-match";
import { buildCreateCompraAliasRequestBody } from "../src/services/api/cartoes";
import { buildCompraReembolsoBreakdown } from "@shared/compra-reembolso";
import {
  formatInvoiceMonthLong,
  formatInvoiceMonthShort,
  getInvoiceMonthStatus,
  getVisibleInvoiceMonths,
  groupInvoiceMonthsByYear,
} from "../src/components/cartoes/invoice-month-selector.utils";
import {
  canAutoRematerializeCompetency,
  diffParcelasCompetencySchedules,
  matchesLegacyPurchaseDateSchedule,
  resolveDueDateFromCompetencia,
} from "@shared/parcelas-compra-competency";

test("formatters: moeda e data em pt-BR", () => {
  assert.equal(formatCurrencyBRL(1234.56), "R$\u00a01.234,56");
  assert.equal(formatIsoDateToBR("2026-04-20"), "20/04/2026");
  assert.equal(formatIsoDateToBR(undefined), "—");
});

test("dividas utils: identifica vencimento passado", () => {
  assert.equal(isOverdueDate("2000-01-01"), true);
  assert.equal(isOverdueDate("2999-01-01"), false);
  assert.equal(isOverdueDate(undefined), false);
});

function buildDividaFixture(overrides: Partial<Divida> = {}, parcelas: Parcela[] = []): Divida & { parcelas: Parcela[] } {
  return {
    id: overrides.id ?? "divida-1",
    userId: overrides.userId ?? "user-1",
    pessoaId: overrides.pessoaId ?? "pessoa-a",
    tipo: overrides.tipo ?? "receber",
    valor: overrides.valor ?? "100.00",
    dataVencimento: overrides.dataVencimento ?? "2026-04-10",
    status: overrides.status ?? "pendente",
    dataPagamento: overrides.dataPagamento ?? null,
    formaPagamento: overrides.formaPagamento ?? null,
    observacaoPagamento: overrides.observacaoPagamento ?? null,
    comprovantePath: overrides.comprovantePath ?? null,
    comprovanteNome: overrides.comprovanteNome ?? null,
    comprovanteMimeType: overrides.comprovanteMimeType ?? null,
    comprovanteTamanho: overrides.comprovanteTamanho ?? null,
    comprovanteEnviadoEm: overrides.comprovanteEnviadoEm ?? null,
    descricao: overrides.descricao ?? "Teste",
    totalParcelas: overrides.totalParcelas ?? null,
    valorTotal: overrides.valorTotal ?? null,
    parcelas,
  };
}

const getPessoaNomeFixture = (pessoaId: string) => {
  const names: Record<string, string> = {
    "pessoa-a": "Ana",
    "pessoa-b": "Bruno",
    "pessoa-c": "Carla",
  };
  return names[pessoaId] ?? "—";
};

const getDividaStatusFixture = (divida: Divida & { parcelas: Parcela[] }) => {
  if (divida.parcelas.length === 0) return divida.status;
  if (divida.parcelas.every((parcela) => parcela.status === "pago")) return "pago";
  return "pendente";
};

test("dividas utils: ordena por maior e menor valor", () => {
  const dividas = [
    buildDividaFixture({ id: "d1", pessoaId: "pessoa-a", valor: "120.00" }),
    buildDividaFixture({ id: "d2", pessoaId: "pessoa-b", valor: "980.00" }),
    buildDividaFixture({ id: "d3", pessoaId: "pessoa-c", valor: "50.00" }),
  ];

  const maiorValor = sortDividasForView(dividas, {
    sortBy: "maior_valor",
    getPessoaNome: getPessoaNomeFixture,
    getDividaStatus: getDividaStatusFixture,
  });
  assert.deepEqual(maiorValor.map((divida) => divida.id), ["d2", "d1", "d3"]);

  const menorValor = sortDividasForView(dividas, {
    sortBy: "menor_valor",
    getPessoaNome: getPessoaNomeFixture,
    getDividaStatus: getDividaStatusFixture,
  });
  assert.deepEqual(menorValor.map((divida) => divida.id), ["d3", "d1", "d2"]);
});

test("dividas utils: ordena por nome A-Z", () => {
  const dividas = [
    buildDividaFixture({ id: "d1", pessoaId: "pessoa-c", valor: "80.00" }),
    buildDividaFixture({ id: "d2", pessoaId: "pessoa-a", valor: "120.00" }),
    buildDividaFixture({ id: "d3", pessoaId: "pessoa-b", valor: "60.00" }),
  ];

  const sorted = sortDividasForView(dividas, {
    sortBy: "nome_az",
    getPessoaNome: getPessoaNomeFixture,
    getDividaStatus: getDividaStatusFixture,
  });

  assert.deepEqual(sorted.map((divida) => divida.id), ["d2", "d3", "d1"]);
});

test("dividas utils: vencimento mais próximo prioriza data relevante da parcela pendente", () => {
  const parcelasA: Parcela[] = [
    {
      id: "pa-1",
      userId: "user-1",
      dividaId: "da",
      numero: 1,
      valor: "50.00",
      dataVencimento: "2026-04-25",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
      observacaoPagamento: null,
      comprovantePath: null,
      comprovanteNome: null,
      comprovanteMimeType: null,
      comprovanteTamanho: null,
      comprovanteEnviadoEm: null,
    },
  ];
  const parcelasB: Parcela[] = [
    {
      id: "pb-1",
      userId: "user-1",
      dividaId: "db",
      numero: 1,
      valor: "70.00",
      dataVencimento: "2026-04-05",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
      observacaoPagamento: null,
      comprovantePath: null,
      comprovanteNome: null,
      comprovanteMimeType: null,
      comprovanteTamanho: null,
      comprovanteEnviadoEm: null,
    },
  ];

  const dividas = [
    buildDividaFixture({ id: "da", pessoaId: "pessoa-a", dataVencimento: "2026-05-10" }, parcelasA),
    buildDividaFixture({ id: "db", pessoaId: "pessoa-b", dataVencimento: "2026-05-10" }, parcelasB),
  ];

  const sorted = sortDividasForView(dividas, {
    sortBy: "vencimento_mais_proximo",
    getPessoaNome: getPessoaNomeFixture,
    getDividaStatus: getDividaStatusFixture,
  });

  assert.deepEqual(sorted.map((divida) => divida.id), ["db", "da"]);
});

test("dividas utils: filtros + ordenação combinam sem mudar totais", () => {
  const dividas = [
    buildDividaFixture({ id: "d1", pessoaId: "pessoa-a", tipo: "receber", status: "pendente", valor: "300.00" }),
    buildDividaFixture({ id: "d2", pessoaId: "pessoa-b", tipo: "receber", status: "pendente", valor: "100.00" }),
    buildDividaFixture({ id: "d3", pessoaId: "pessoa-c", tipo: "pagar", status: "pago", valor: "900.00" }),
  ];

  const filtradas = dividas.filter((divida) => divida.tipo === "receber" && divida.status === "pendente");
  const sorted = sortDividasForView(filtradas, {
    sortBy: "maior_valor",
    getPessoaNome: getPessoaNomeFixture,
    getDividaStatus: getDividaStatusFixture,
  });

  assert.deepEqual(sorted.map((divida) => divida.id), ["d1", "d2"]);
  assert.equal(sorted.reduce((sum, divida) => sum + Number(divida.valor), 0), 400);
});

test("dividas utils: lista vazia retorna vazio sem erro", () => {
  const sorted = sortDividasForView([], {
    sortBy: "vencimento_mais_proximo",
    getPessoaNome: () => "",
    getDividaStatus: () => "pendente",
  });
  assert.deepEqual(sorted, []);
});

function buildCartaoViewFixture(overrides: Partial<Cartao> = {}): Cartao {
  return {
    id: overrides.id ?? "cartao-1",
    userId: overrides.userId ?? "user-1",
    nome: overrides.nome ?? "Nubank Mastercard",
    limite: overrides.limite ?? "1000.00",
    melhorDiaCompra: overrides.melhorDiaCompra ?? 20,
    diaVencimento: overrides.diaVencimento ?? 10,
    iconeId: overrides.iconeId ?? null,
  };
}

function buildCompraCartaoViewFixture(overrides: Partial<CompraCartao> = {}): CompraCartao {
  return {
    id: overrides.id ?? "compra-1",
    userId: overrides.userId ?? "user-1",
    cartaoId: overrides.cartaoId ?? "cartao-1",
    descricao: overrides.descricao ?? "Compra teste",
    valorTotal: overrides.valorTotal ?? "100.00",
    parcelas: overrides.parcelas ?? 1,
    parcelaAtual: overrides.parcelaAtual ?? 1,
    valorParcela: overrides.valorParcela ?? "100.00",
    dataCompra: overrides.dataCompra ?? "2026-04-20",
    pessoaId: overrides.pessoaId ?? "pessoa-a",
    statusPessoa: overrides.statusPessoa ?? "pendente",
    dataPagamentoPessoa: overrides.dataPagamentoPessoa ?? null,
    reembolsoModo: overrides.reembolsoModo ?? null,
    reembolsoValorTotal: overrides.reembolsoValorTotal ?? null,
    reembolsoPercentual: overrides.reembolsoPercentual ?? null,
  };
}

function buildParcelaCompraViewFixture(overrides: Partial<ParcelaCompra> = {}): ParcelaCompra {
  return {
    id: overrides.id ?? "parcela-compra-1",
    userId: overrides.userId ?? "user-1",
    compraCartaoId: overrides.compraCartaoId ?? "compra-1",
    numero: overrides.numero ?? 1,
    valor: overrides.valor ?? "100.00",
    dataVencimento: overrides.dataVencimento ?? "2026-04-20",
    statusCartao: overrides.statusCartao ?? "pendente",
    dataPagamentoCartao: overrides.dataPagamentoCartao ?? null,
    statusPessoa: overrides.statusPessoa ?? "pendente",
    dataPagamentoPessoa: overrides.dataPagamentoPessoa ?? null,
    comprovantePath: overrides.comprovantePath ?? null,
    comprovanteNome: overrides.comprovanteNome ?? null,
    comprovanteMimeType: overrides.comprovanteMimeType ?? null,
    comprovanteTamanho: overrides.comprovanteTamanho ?? null,
    comprovanteEnviadoEm: overrides.comprovanteEnviadoEm ?? null,
  };
}

test("dividas view: compra vinculada aparece como origem cartao com valor parcial de reembolso", () => {
  const manual = buildDividaFixture({ id: "d-manual", pessoaId: "pessoa-a", tipo: "receber", valor: "100.00", status: "pendente" });
  const compra = buildCompraCartaoViewFixture({
    id: "c-assai",
    pessoaId: "pessoa-b",
    descricao: "Assai Atacadista Lj89",
    valorTotal: "422.79",
    parcelas: 1,
    parcelaAtual: 1,
    valorParcela: "422.79",
    reembolsoModo: "metade",
    statusPessoa: "pendente",
  });
  const cartao = buildCartaoViewFixture({ id: "cartao-1", nome: "Nubank Mastercard" });
  const manualList = [manual as Divida & { parcelas: Parcela[] }];

  const items = buildDividasViewItems({
    dividasManuais: manualList,
    comprasCartaoVinculadas: [compra],
    parcelasCompra: [],
    cartoes: [cartao],
    getDividaStatus: getDividaStatusFixture,
    getDividaValorPendente: (divida) => Number(divida.valor),
    getDividaValorPago: () => 0,
  });

  const itemCartao = items.find((item) => item.origin === "cartao");
  assert.ok(itemCartao);
  assert.equal(itemCartao?.valorTotal, 211.4);
  assert.equal(itemCartao?.mensalPessoa, 211.4);
  assert.equal(itemCartao?.cardTotalCompra, 422.79);
  assert.equal(itemCartao?.tipo, "receber");
});

test("dividas view: filtros de origem todos/manual/cartao", () => {
  const manual = buildDividaFixture({ id: "d-manual", pessoaId: "pessoa-a", tipo: "receber", valor: "100.00", status: "pendente" });
  const compra = buildCompraCartaoViewFixture({ id: "c-1", pessoaId: "pessoa-b", statusPessoa: "pendente" });
  const items = buildDividasViewItems({
    dividasManuais: [manual as Divida & { parcelas: Parcela[] }],
    comprasCartaoVinculadas: [compra],
    parcelasCompra: [],
    cartoes: [buildCartaoViewFixture({ id: "cartao-1" })],
    getDividaStatus: getDividaStatusFixture,
    getDividaValorPendente: (divida) => Number(divida.valor),
    getDividaValorPago: () => 0,
  });

  const todos = filterDividasViewItems({
    items,
    search: "",
    filterTipo: "todos",
    filterStatus: "todos",
    filterOrigin: "todos",
    getPessoaNome: getPessoaNomeFixture,
  });
  const manuais = filterDividasViewItems({
    items,
    search: "",
    filterTipo: "todos",
    filterStatus: "todos",
    filterOrigin: "manual",
    getPessoaNome: getPessoaNomeFixture,
  });
  const cartoes = filterDividasViewItems({
    items,
    search: "",
    filterTipo: "todos",
    filterStatus: "todos",
    filterOrigin: "cartao",
    getPessoaNome: getPessoaNomeFixture,
  });

  assert.equal(todos.length, 2);
  assert.equal(manuais.length, 1);
  assert.equal(cartoes.length, 1);
  assert.equal(cartoes[0]?.origin, "cartao");
});

test("dividas view: status pago em compra vinculada não entra como pendente", () => {
  const compraPaga = buildCompraCartaoViewFixture({
    id: "c-paga",
    statusPessoa: "pago",
    valorTotal: "422.79",
    reembolsoModo: "metade",
  });
  const items = buildDividasViewItems({
    dividasManuais: [],
    comprasCartaoVinculadas: [compraPaga],
    parcelasCompra: [],
    cartoes: [buildCartaoViewFixture({ id: "cartao-1" })],
    getDividaStatus: getDividaStatusFixture,
    getDividaValorPendente: () => 0,
    getDividaValorPago: () => 0,
  });

  const sorted = sortDividasViewItems(items, {
    sortBy: "vencimento_mais_proximo",
    getPessoaNome: getPessoaNomeFixture,
  });

  assert.equal(sorted.length, 1);
  assert.equal(sorted[0]?.status, "pago");
  assert.equal(sorted[0]?.valorPendente, 0);
});

test("dividas view: compra de cartão com parcelas vencidas não entra como quitada", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "c-vencida",
    pessoaId: "pessoa-b",
    descricao: "Martelete Leroy Merlin",
    valorTotal: "700.00",
    valorParcela: "100.00",
    parcelas: 7,
    parcelaAtual: 1,
    reembolsoModo: "total",
    statusPessoa: "pago",
  });

  const parcelasCompra = Array.from({ length: 7 }, (_, index) => buildParcelaCompraViewFixture({
    id: `pc-vencida-${index + 1}`,
    compraCartaoId: "c-vencida",
    numero: index + 1,
    valor: "100.00",
    dataVencimento: "2020-01-10",
    statusPessoa: "pendente",
  }));

  const items = buildDividasViewItems({
    dividasManuais: [],
    comprasCartaoVinculadas: [compra],
    parcelasCompra,
    cartoes: [buildCartaoViewFixture({ id: "cartao-1" })],
    getDividaStatus: getDividaStatusFixture,
    getDividaValorPendente: () => 0,
    getDividaValorPago: () => 0,
  });

  const onlyItem = items[0];
  assert.ok(onlyItem);
  assert.equal(onlyItem?.status, "vencido");
  assert.equal(onlyItem?.parcelasPagas, 0);
  assert.equal(onlyItem?.parcelasPendentes, 7);
  assert.equal(onlyItem?.parcelasVencidas, 7);

  const quitado = filterDividasViewItems({
    items,
    search: "",
    filterTipo: "todos",
    filterStatus: "pago",
    filterOrigin: "cartao",
    getPessoaNome: getPessoaNomeFixture,
  });
  assert.equal(quitado.length, 0);
});

test("dividas view: compra de cartão parcialmente reembolsada não aparece em quitado", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "c-parcial",
    valorTotal: "1000.00",
    valorParcela: "100.00",
    parcelas: 10,
    parcelaAtual: 1,
    reembolsoModo: "metade",
  });

  const parcelasCompra = Array.from({ length: 10 }, (_, index) => buildParcelaCompraViewFixture({
    id: `pc-parcial-${index + 1}`,
    compraCartaoId: "c-parcial",
    numero: index + 1,
    valor: "100.00",
    dataVencimento: "2030-01-10",
    statusPessoa: index < 4 ? "pago" : "pendente",
  }));

  const items = buildDividasViewItems({
    dividasManuais: [],
    comprasCartaoVinculadas: [compra],
    parcelasCompra,
    cartoes: [buildCartaoViewFixture({ id: "cartao-1" })],
    getDividaStatus: getDividaStatusFixture,
    getDividaValorPendente: () => 0,
    getDividaValorPago: () => 0,
  });

  assert.equal(items[0]?.status, "pendente");
  const quitado = filterDividasViewItems({
    items,
    search: "",
    filterTipo: "todos",
    filterStatus: "pago",
    filterOrigin: "cartao",
    getPessoaNome: getPessoaNomeFixture,
  });
  assert.equal(quitado.length, 0);
});

test("dividas view: compra de cartão com todas parcelas reembolsadas aparece como quitada", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "c-quitada",
    valorTotal: "422.79",
    valorParcela: "60.40",
    parcelas: 7,
    parcelaAtual: 1,
    reembolsoModo: "metade",
    statusPessoa: "pendente",
  });

  const parcelasCompra = Array.from({ length: 7 }, (_, index) => buildParcelaCompraViewFixture({
    id: `pc-quitada-${index + 1}`,
    compraCartaoId: "c-quitada",
    numero: index + 1,
    valor: "60.40",
    dataVencimento: "2026-01-10",
    statusPessoa: "pago",
  }));

  const items = buildDividasViewItems({
    dividasManuais: [],
    comprasCartaoVinculadas: [compra],
    parcelasCompra,
    cartoes: [buildCartaoViewFixture({ id: "cartao-1" })],
    getDividaStatus: getDividaStatusFixture,
    getDividaValorPendente: () => 0,
    getDividaValorPago: () => 0,
  });

  assert.equal(items[0]?.status, "pago");
  assert.equal(items[0]?.valorPendente, 0);
  const quitado = filterDividasViewItems({
    items,
    search: "",
    filterTipo: "todos",
    filterStatus: "pago",
    filterOrigin: "cartao",
    getPessoaNome: getPessoaNomeFixture,
  });
  assert.equal(quitado.length, 1);
});

function buildPessoaFixture(overrides: Partial<Pessoa> = {}): Pessoa {
  return {
    id: overrides.id ?? "pessoa-1",
    userId: overrides.userId ?? "user-1",
    nome: overrides.nome ?? "Pessoa Teste",
    tipo: overrides.tipo ?? "me_deve",
    telefone: overrides.telefone ?? null,
    observacao: overrides.observacao ?? null,
  };
}

function buildServicoFixture(overrides: Partial<Servico> = {}): Servico {
  return {
    id: overrides.id ?? "servico-1",
    userId: overrides.userId ?? "user-1",
    nome: overrides.nome ?? "Servico teste",
    categoria: overrides.categoria ?? "streaming",
    valorMensal: overrides.valorMensal ?? "19.90",
    dataCobranca: overrides.dataCobranca ?? 10,
    formaPagamento: overrides.formaPagamento ?? "cartao",
    compraCartaoId: overrides.compraCartaoId ?? null,
    status: overrides.status ?? "ativo",
    iconeId: overrides.iconeId ?? null,
  };
}

test("pessoas utils: ordena por nome A-Z e Z-A", () => {
  const pessoas = [
    buildPessoaFixture({ id: "p1", nome: "Carla" }),
    buildPessoaFixture({ id: "p2", nome: "Ana" }),
    buildPessoaFixture({ id: "p3", nome: "Bruno" }),
  ];

  const metricsById = {
    p1: { saldo: 10, valorReceber: 100, valorPagar: 20 },
    p2: { saldo: 30, valorReceber: 50, valorPagar: 10 },
    p3: { saldo: 20, valorReceber: 200, valorPagar: 40 },
  };

  const asc = sortPessoasForView(pessoas, {
    sortBy: "nome_az",
    getMetrics: (pessoaId) => metricsById[pessoaId as keyof typeof metricsById],
  });
  assert.deepEqual(asc.map((pessoa) => pessoa.id), ["p2", "p3", "p1"]);

  const desc = sortPessoasForView(pessoas, {
    sortBy: "nome_za",
    getMetrics: (pessoaId) => metricsById[pessoaId as keyof typeof metricsById],
  });
  assert.deepEqual(desc.map((pessoa) => pessoa.id), ["p1", "p3", "p2"]);
});

test("pessoas utils: ordena por maior e menor saldo", () => {
  const pessoas = [
    buildPessoaFixture({ id: "p1", nome: "Ana" }),
    buildPessoaFixture({ id: "p2", nome: "Bruno" }),
    buildPessoaFixture({ id: "p3", nome: "Carla" }),
  ];
  const metricsById = {
    p1: { saldo: 120, valorReceber: 320, valorPagar: 90 },
    p2: { saldo: -15, valorReceber: 200, valorPagar: 150 },
    p3: { saldo: 45, valorReceber: 410, valorPagar: 20 },
  };

  const maiorSaldo = sortPessoasForView(pessoas, {
    sortBy: "maior_saldo",
    getMetrics: (pessoaId) => metricsById[pessoaId as keyof typeof metricsById],
  });
  assert.deepEqual(maiorSaldo.map((pessoa) => pessoa.id), ["p1", "p3", "p2"]);

  const menorSaldo = sortPessoasForView(pessoas, {
    sortBy: "menor_saldo",
    getMetrics: (pessoaId) => metricsById[pessoaId as keyof typeof metricsById],
  });
  assert.deepEqual(menorSaldo.map((pessoa) => pessoa.id), ["p2", "p3", "p1"]);
});

test("pessoas utils: busca + ordenação juntos preserva ordenação esperada", () => {
  const pessoas = [
    buildPessoaFixture({ id: "p1", nome: "Ana Silva" }),
    buildPessoaFixture({ id: "p2", nome: "Ana Costa" }),
    buildPessoaFixture({ id: "p3", nome: "Bruno Ana" }),
  ];
  const metricsById = {
    p1: { saldo: 20, valorReceber: 100, valorPagar: 55 },
    p2: { saldo: 10, valorReceber: 80, valorPagar: 120 },
    p3: { saldo: 0, valorReceber: 30, valorPagar: 10 },
  };

  const resultadoBusca = pessoas.filter((pessoa) => pessoa.nome.toLowerCase().includes("ana"));
  const sorted = sortPessoasForView(resultadoBusca, {
    sortBy: "maior_valor_pagar",
    getMetrics: (pessoaId) => metricsById[pessoaId as keyof typeof metricsById],
  });

  assert.deepEqual(sorted.map((pessoa) => pessoa.id), ["p2", "p1", "p3"]);
});

test("pessoas utils: lista vazia retorna vazio sem erro", () => {
  const sorted = sortPessoasForView([], {
    sortBy: "nome_az",
    getMetrics: () => ({ saldo: 0, valorReceber: 0, valorPagar: 0 }),
  });
  assert.deepEqual(sorted, []);
});

test("pessoas utils: campos indefinidos usam fallback seguro", () => {
  const pessoas = [
    { id: "p1", nome: undefined } as unknown as Pessoa,
    { id: "p2", nome: "Ana" } as unknown as Pessoa,
  ];

  const sorted = sortPessoasForView(pessoas, {
    sortBy: "maior_saldo",
    getMetrics: (id) => (id === "p2" ? { saldo: 20, valorReceber: 5, valorPagar: 1 } : (undefined as unknown as { saldo: number; valorReceber: number; valorPagar: number })),
  });

  assert.deepEqual(sorted.map((pessoa) => pessoa.id), ["p2", "p1"]);
});

test("servicos utils: ordena por nome A-Z e Z-A", () => {
  const servicos = [
    buildServicoFixture({ id: "s1", nome: "YouTube Premium" }),
    buildServicoFixture({ id: "s2", nome: "Apple iCloud" }),
    buildServicoFixture({ id: "s3", nome: "Netflix" }),
  ];

  const asc = sortServicosForView(servicos, { sortBy: "nome_az", referenceDay: 10 });
  assert.deepEqual(asc.map((servico) => servico.id), ["s2", "s3", "s1"]);

  const desc = sortServicosForView(servicos, { sortBy: "nome_za", referenceDay: 10 });
  assert.deepEqual(desc.map((servico) => servico.id), ["s1", "s3", "s2"]);
});

test("servicos utils: ordena por maior e menor valor", () => {
  const servicos = [
    buildServicoFixture({ id: "s1", valorMensal: "89.90", nome: "Plano A" }),
    buildServicoFixture({ id: "s2", valorMensal: "19.90", nome: "Plano B" }),
    buildServicoFixture({ id: "s3", valorMensal: "49.90", nome: "Plano C" }),
  ];

  const maiorValor = sortServicosForView(servicos, { sortBy: "maior_valor", referenceDay: 10 });
  assert.deepEqual(maiorValor.map((servico) => servico.id), ["s1", "s3", "s2"]);

  const menorValor = sortServicosForView(servicos, { sortBy: "menor_valor", referenceDay: 10 });
  assert.deepEqual(menorValor.map((servico) => servico.id), ["s2", "s3", "s1"]);
});

test("servicos utils: ordena por dia de cobrança mais próximo", () => {
  const servicos = [
    buildServicoFixture({ id: "s1", dataCobranca: 2, nome: "Dia 2" }),
    buildServicoFixture({ id: "s2", dataCobranca: 12, nome: "Dia 12" }),
    buildServicoFixture({ id: "s3", dataCobranca: 29, nome: "Dia 29" }),
  ];

  const sorted = sortServicosForView(servicos, { sortBy: "dia_cobranca_mais_proximo", referenceDay: 10 });
  assert.deepEqual(sorted.map((servico) => servico.id), ["s2", "s3", "s1"]);
});

test("servicos utils: ordena por status e categoria", () => {
  const servicos = [
    buildServicoFixture({ id: "s1", nome: "Seguro A", categoria: "seguro", status: "cancelado" }),
    buildServicoFixture({ id: "s2", nome: "Netflix", categoria: "streaming", status: "ativo" }),
    buildServicoFixture({ id: "s3", nome: "Spotify", categoria: "streaming", status: "ativo" }),
    buildServicoFixture({ id: "s4", nome: "Canva", categoria: "software", status: "ativo" }),
  ];

  const byStatus = sortServicosForView(servicos, { sortBy: "status", referenceDay: 10 });
  assert.deepEqual(byStatus.map((servico) => servico.id), ["s4", "s2", "s3", "s1"]);

  const byCategory = sortServicosForView(servicos, { sortBy: "categoria", referenceDay: 10 });
  assert.deepEqual(byCategory.map((servico) => servico.id), ["s1", "s4", "s2", "s3"]);
});

test("servicos utils: filtro + ordenação juntos preserva ordem esperada", () => {
  const servicos = [
    buildServicoFixture({ id: "s1", nome: "Netflix", status: "ativo", valorMensal: "59.90" }),
    buildServicoFixture({ id: "s2", nome: "Spotify", status: "cancelado", valorMensal: "21.90" }),
    buildServicoFixture({ id: "s3", nome: "Apple iCloud", status: "ativo", valorMensal: "9.90" }),
  ];

  const somenteAtivos = servicos.filter((servico) => servico.status === "ativo");
  const sorted = sortServicosForView(somenteAtivos, { sortBy: "maior_valor", referenceDay: 10 });

  assert.deepEqual(sorted.map((servico) => servico.id), ["s1", "s3"]);
});

test("servicos utils: lista vazia retorna vazio sem erro", () => {
  const sorted = sortServicosForView([], { sortBy: "nome_az", referenceDay: 10 });
  assert.deepEqual(sorted, []);
});

test("cartoes utils: calcula próxima fatura e dias restantes", () => {
  const next = getNextInvoiceDate(20);
  assert.match(next, /^\d{2}\/\d{2}\/\d{4}$/);

  const days = getDaysUntilInvoice(20);
  assert.equal(Number.isInteger(days), true);
  assert.equal(days >= 0, true);
  assert.equal(days <= 62, true);
});

test("cartoes utils: parcela vencida somente quando pendente e data passada", () => {
  assert.equal(
    isParcelaVencida({
      id: "1",
      userId: "u1",
      compraCartaoId: "c1",
      numero: 1,
      valor: "10.00",
      dataVencimento: "2000-01-01",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    }),
    true,
  );

  assert.equal(
    isParcelaVencida({
      id: "2",
      userId: "u1",
      compraCartaoId: "c1",
      numero: 1,
      valor: "10.00",
      dataVencimento: "2000-01-01",
      statusCartao: "pago",
      dataPagamentoCartao: "2000-01-01",
      statusPessoa: null,
      dataPagamentoPessoa: null,
    }),
    false,
  );
});

test("invoice month selector: janela compacta mostra poucos meses ao redor do selecionado", () => {
  const availableMonths = [
    "2026-08",
    "2026-07",
    "2026-06",
    "2026-05",
    "2026-04",
    "2026-03",
    "2026-02",
    "2026-01",
  ];

  const visible = getVisibleInvoiceMonths({
    selectedMonth: "2026-05",
    currentMonth: "2026-05",
    availableMonths,
    previousCount: 2,
    nextCount: 3,
  });

  assert.deepEqual(visible, ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
  assert.equal(visible.length, 6);
});

test("invoice month selector: status atual/futura/fechada é identificado corretamente", () => {
  assert.equal(getInvoiceMonthStatus("2026-05", "2026-05"), "atual");
  assert.equal(getInvoiceMonthStatus("2026-06", "2026-05"), "futura");
  assert.equal(getInvoiceMonthStatus("2026-04", "2026-05"), "fechada");
});

test("invoice month selector: formatação curta e longa mantém legibilidade", () => {
  assert.equal(formatInvoiceMonthShort("2026-05", "2026-05"), "Mai");
  assert.equal(formatInvoiceMonthShort("2027-05", "2026-05"), "Mai/27");
  assert.equal(formatInvoiceMonthLong("2026-05"), "Maio de 2026");
});

test("invoice month selector: agrupamento por ano permite acesso a meses antigos/futuros", () => {
  const groups = groupInvoiceMonthsByYear([
    "2027-05",
    "2027-04",
    "2026-12",
    "2026-05",
    "2025-11",
  ]);

  assert.equal(groups.length, 3);
  assert.equal(groups[0]?.year, "2027");
  assert.deepEqual(groups[0]?.months, ["2027-05", "2027-04"]);
  assert.equal(groups[2]?.year, "2025");
  assert.deepEqual(groups[2]?.months, ["2025-11"]);
});

test("competência diagnóstico: compra com cronograma legado divergente é detectada e marcada para correção", () => {
  const currentRows = [
    {
      numero: 1,
      dataVencimento: "2025-09-17",
      statusCartao: "pago",
      dataPagamentoCartao: "2025-09-18",
      statusPessoa: null,
      dataPagamentoPessoa: null,
      comprovantePath: null,
      comprovanteNome: null,
      comprovanteMimeType: null,
      comprovanteTamanho: null,
      comprovanteEnviadoEm: null,
    },
    {
      numero: 8,
      dataVencimento: "2026-04-17",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
      comprovantePath: null,
      comprovanteNome: null,
      comprovanteMimeType: null,
      comprovanteTamanho: null,
      comprovanteEnviadoEm: null,
    },
  ];

  const suggestedRows = [
    { numero: 1, dataVencimento: "2025-10-23" },
    { numero: 8, dataVencimento: "2026-05-23" },
  ];

  const diffs = diffParcelasCompetencySchedules(currentRows, suggestedRows);
  assert.equal(diffs.length, 2);
  assert.equal(diffs.every((diff) => diff.kind === "due_date_mismatch"), true);
  assert.equal(matchesLegacyPurchaseDateSchedule(
    currentRows.map((row) => ({ numero: row.numero, dataVencimento: row.dataVencimento })),
    [
      { numero: 1, dataVencimento: "2025-09-17" },
      { numero: 8, dataVencimento: "2026-04-17" },
    ],
  ), true);
});

test("competência diagnóstico: compra já correta não gera diferenças", () => {
  const currentRows = [
    { numero: 1, dataVencimento: "2026-05-23" },
    { numero: 2, dataVencimento: "2026-06-23" },
  ];
  const suggestedRows = [
    { numero: 1, dataVencimento: "2026-05-23" },
    { numero: 2, dataVencimento: "2026-06-23" },
  ];

  const diffs = diffParcelasCompetencySchedules(currentRows, suggestedRows);
  assert.equal(diffs.length, 0);
});

test("competência diagnóstico: parcela paga ou com comprovante bloqueia rematerialização automática", () => {
  const diffsWithPaid = diffParcelasCompetencySchedules(
    [{
      numero: 1,
      dataVencimento: "2025-09-17",
      statusCartao: "pago",
      dataPagamentoCartao: "2025-09-18",
      statusPessoa: null,
      dataPagamentoPessoa: null,
      comprovantePath: null,
      comprovanteNome: null,
      comprovanteMimeType: null,
      comprovanteTamanho: null,
      comprovanteEnviadoEm: null,
    }],
    [{ numero: 1, dataVencimento: "2026-05-23" }],
  );
  assert.equal(canAutoRematerializeCompetency(diffsWithPaid).canApply, false);

  const diffsWithProof = diffParcelasCompetencySchedules(
    [{
      numero: 1,
      dataVencimento: "2025-09-17",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
      comprovantePath: "/proofs/doc.pdf",
      comprovanteNome: "doc.pdf",
      comprovanteMimeType: "application/pdf",
      comprovanteTamanho: 1200,
      comprovanteEnviadoEm: "2026-04-12T10:00:00.000Z",
    }],
    [{ numero: 1, dataVencimento: "2026-05-23" }],
  );
  assert.equal(canAutoRematerializeCompetency(diffsWithProof).canApply, false);
});

test("competência diagnóstico: compra sem pagamentos/comprovantes pode ser rematerializada sem alterar valor/quantidade", () => {
  const currentRows = [
    {
      numero: 1,
      dataVencimento: "2026-04-17",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
      comprovantePath: null,
      comprovanteNome: null,
      comprovanteMimeType: null,
      comprovanteTamanho: null,
      comprovanteEnviadoEm: null,
    },
    {
      numero: 2,
      dataVencimento: "2026-05-17",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
      comprovantePath: null,
      comprovanteNome: null,
      comprovanteMimeType: null,
      comprovanteTamanho: null,
      comprovanteEnviadoEm: null,
    },
  ];
  const suggestedRows = [
    { numero: 1, dataVencimento: "2026-05-23" },
    { numero: 2, dataVencimento: "2026-06-23" },
  ];

  const diffs = diffParcelasCompetencySchedules(currentRows, suggestedRows);
  const decision = canAutoRematerializeCompetency(diffs);
  assert.equal(decision.canApply, true);
  assert.equal(currentRows.length, suggestedRows.length);
});

test("competência de parcela: usa dia de vencimento do cartão ao mover para outra fatura", () => {
  const dueDate = resolveDueDateFromCompetencia({
    competencia: "2026-03",
    diaVencimento: 24,
    fallbackDataVencimento: "2026-05-20",
  });
  assert.equal(dueDate, "2026-03-24");
});

test("competência de parcela: sem dia de vencimento no cartão usa fallback seguro da própria parcela", () => {
  const dueDate = resolveDueDateFromCompetencia({
    competencia: "2026-02",
    diaVencimento: null,
    fallbackDataVencimento: "2026-05-31",
  });
  assert.equal(dueDate, "2026-02-28");
});

test("card limit usage: parcela paga de mês anterior não entra na fatura atual nem compromete limite", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "compra-paga-antiga",
    cartaoId: "cartao-1",
    parcelas: 6,
    parcelaAtual: 6,
    valorParcela: "200.00",
    valorTotal: "1200.00",
  });
  const parcelaPagaAnterior = buildParcelaCompraViewFixture({
    id: "parcela-paga-antiga",
    compraCartaoId: compra.id,
    numero: 6,
    valor: "200.00",
    dataVencimento: format(addMonths(new Date(), -1), "yyyy-MM-dd"),
    statusCartao: "pago",
  });
  const grouped = groupParcelasCompraByCompraId([parcelaPagaAnterior]);
  const currentMonth = format(new Date(), "yyyy-MM");

  const faturaAtual = calculateCardCurrentInvoiceTotal("cartao-1", [compra], grouped, currentMonth);
  const limiteComprometido = calculateCardUsedLimit("cartao-1", [compra], grouped);

  assert.equal(faturaAtual, 0);
  assert.equal(limiteComprometido, 0);
});

test("card limit usage: parcela pendente do mês atual entra na fatura atual", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "compra-mes-atual",
    cartaoId: "cartao-1",
    valorParcela: "150.00",
    valorTotal: "450.00",
    parcelas: 3,
    parcelaAtual: 2,
  });
  const parcelaPendenteAtual = buildParcelaCompraViewFixture({
    id: "parcela-atual",
    compraCartaoId: compra.id,
    numero: 2,
    valor: "150.00",
    dataVencimento: format(new Date(), "yyyy-MM-dd"),
    statusCartao: "pendente",
  });
  const grouped = groupParcelasCompraByCompraId([parcelaPendenteAtual]);
  const currentMonth = format(new Date(), "yyyy-MM");

  const faturaAtual = calculateCardCurrentInvoiceTotal("cartao-1", [compra], grouped, currentMonth);

  assert.equal(faturaAtual, 150);
  assert.equal(compraHasOpenInstallmentInMonth(compra, grouped.get(compra.id), currentMonth), true);
});

test("card limit usage: parcela vencida não paga continua comprometendo limite, mas fora da competência atual", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "compra-vencida",
    cartaoId: "cartao-1",
    valorParcela: "90.00",
    valorTotal: "180.00",
    parcelas: 2,
    parcelaAtual: 2,
  });
  const parcelaVencidaNaoPaga = buildParcelaCompraViewFixture({
    id: "parcela-vencida",
    compraCartaoId: compra.id,
    numero: 1,
    valor: "90.00",
    dataVencimento: format(addMonths(new Date(), -1), "yyyy-MM-dd"),
    statusCartao: "pendente",
  });
  const grouped = groupParcelasCompraByCompraId([parcelaVencidaNaoPaga]);
  const currentMonth = format(new Date(), "yyyy-MM");

  const faturaAtual = calculateCardCurrentInvoiceTotal("cartao-1", [compra], grouped, currentMonth);
  const limiteComprometido = calculateCardUsedLimit("cartao-1", [compra], grouped);

  assert.equal(faturaAtual, 0);
  assert.equal(limiteComprometido, 90);
});

test("card limit usage: parcela futura não entra na fatura atual, mas compromete limite", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "compra-futura",
    cartaoId: "cartao-1",
    valorParcela: "80.00",
    valorTotal: "240.00",
    parcelas: 3,
    parcelaAtual: 1,
  });
  const parcelaFutura = buildParcelaCompraViewFixture({
    id: "parcela-futura",
    compraCartaoId: compra.id,
    numero: 3,
    valor: "80.00",
    dataVencimento: format(addMonths(new Date(), 1), "yyyy-MM-dd"),
    statusCartao: "pendente",
  });
  const grouped = groupParcelasCompraByCompraId([parcelaFutura]);
  const currentMonth = format(new Date(), "yyyy-MM");

  const faturaAtual = calculateCardCurrentInvoiceTotal("cartao-1", [compra], grouped, currentMonth);
  const limiteComprometido = calculateCardUsedLimit("cartao-1", [compra], grouped);

  assert.equal(faturaAtual, 0);
  assert.equal(limiteComprometido, 80);
});

test("card limit usage: parcela cancelada não entra em fatura atual nem limite comprometido", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "compra-cancelada",
    cartaoId: "cartao-1",
    valorParcela: "55.00",
    valorTotal: "55.00",
    parcelas: 1,
    parcelaAtual: 1,
  });
  const parcelaCancelada = buildParcelaCompraViewFixture({
    id: "parcela-cancelada",
    compraCartaoId: compra.id,
    numero: 1,
    valor: "55.00",
    dataVencimento: format(new Date(), "yyyy-MM-dd"),
    statusCartao: "cancelado",
  });
  const grouped = groupParcelasCompraByCompraId([parcelaCancelada]);
  const currentMonth = format(new Date(), "yyyy-MM");

  const faturaAtual = calculateCardCurrentInvoiceTotal("cartao-1", [compra], grouped, currentMonth);
  const limiteComprometido = calculateCardUsedLimit("cartao-1", [compra], grouped);

  assert.equal(faturaAtual, 0);
  assert.equal(limiteComprometido, 0);
});

test("card limit usage: getInvoiceCompetency extrai yyyy-MM de data de vencimento", () => {
  assert.equal(getInvoiceCompetency("2026-04-21"), "2026-04");
  assert.equal(getInvoiceCompetency("2026-04"), "2026-04");
  assert.equal(getInvoiceCompetency(null), null);
});

test("card limit usage: filterParcelasByCompetency filtra somente o mês selecionado", () => {
  const parcelas = [
    buildParcelaCompraViewFixture({ id: "p-abr", dataVencimento: "2026-04-05" }),
    buildParcelaCompraViewFixture({ id: "p-mai", dataVencimento: "2026-05-05" }),
  ];

  const abril = filterParcelasByCompetency(parcelas, "2026-04");
  const maio = filterParcelasByCompetency(parcelas, "2026-05");

  assert.deepEqual(abril.map((item) => item.id), ["p-abr"]);
  assert.deepEqual(maio.map((item) => item.id), ["p-mai"]);
});

test("card limit usage: compra de dezembro com parcela vencendo em abril entra em abril", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "compra-antiga-parcelada",
    dataCompra: "2025-12-24",
    parcelas: 10,
    parcelaAtual: 5,
    valorParcela: "157.58",
    valorTotal: "1575.80",
  });
  const parcelaAbril = buildParcelaCompraViewFixture({
    id: "p-abril",
    compraCartaoId: compra.id,
    numero: 5,
    valor: "157.58",
    dataVencimento: "2026-04-24",
    statusCartao: "pendente",
  });
  const grouped = groupParcelasCompraByCompraId([parcelaAbril]);

  assert.equal(
    compraHasInstallmentInCompetency(compra, grouped.get(compra.id), "2026-04", { includePaid: true }),
    true,
  );
  assert.equal(
    compraHasInstallmentInCompetency(compra, grouped.get(compra.id), "2026-05", { includePaid: true }),
    false,
  );
});

test("card limit usage: parcela paga no mês aparece na competência mas não soma fatura aberta", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "compra-abril-paga",
    parcelas: 1,
    parcelaAtual: 1,
    valorParcela: "200.00",
    valorTotal: "200.00",
  });
  const parcelaPagaAbril = buildParcelaCompraViewFixture({
    id: "p-abril-paga",
    compraCartaoId: compra.id,
    numero: 1,
    valor: "200.00",
    dataVencimento: "2026-04-10",
    statusCartao: "pago",
  });
  const grouped = groupParcelasCompraByCompraId([parcelaPagaAbril]);

  const invoiceAbril = calculateCardInvoiceForCompetency("cartao-1", [compra], grouped, "2026-04");
  assert.equal(
    compraHasInstallmentInCompetency(compra, grouped.get(compra.id), "2026-04", { includePaid: true }),
    true,
  );
  assert.equal(invoiceAbril, 0);
});

test("card limit usage: trocar competência muda totais de todos os cartões", () => {
  const compraCardA = buildCompraCartaoViewFixture({
    id: "c-a",
    cartaoId: "card-a",
    valorParcela: "100.00",
    valorTotal: "200.00",
    parcelas: 2,
    parcelaAtual: 1,
  });
  const compraCardB = buildCompraCartaoViewFixture({
    id: "c-b",
    cartaoId: "card-b",
    valorParcela: "75.00",
    valorTotal: "150.00",
    parcelas: 2,
    parcelaAtual: 1,
  });
  const parcelas = [
    buildParcelaCompraViewFixture({
      id: "a-abril",
      compraCartaoId: compraCardA.id,
      numero: 1,
      valor: "100.00",
      dataVencimento: "2026-04-08",
      statusCartao: "pendente",
    }),
    buildParcelaCompraViewFixture({
      id: "b-maio",
      compraCartaoId: compraCardB.id,
      numero: 1,
      valor: "75.00",
      dataVencimento: "2026-05-08",
      statusCartao: "pendente",
    }),
  ];
  const grouped = groupParcelasCompraByCompraId(parcelas);

  const totalAbril =
    calculateCardInvoiceForCompetency("card-a", [compraCardA, compraCardB], grouped, "2026-04")
    + calculateCardInvoiceForCompetency("card-b", [compraCardA, compraCardB], grouped, "2026-04");
  const totalMaio =
    calculateCardInvoiceForCompetency("card-a", [compraCardA, compraCardB], grouped, "2026-05")
    + calculateCardInvoiceForCompetency("card-b", [compraCardA, compraCardB], grouped, "2026-05");

  assert.equal(totalAbril, 100);
  assert.equal(totalMaio, 75);
});

test("compra cartao dialog: parse de moeda aceita formatos pt-BR e decimal", () => {
  assert.equal(parseMoneyLikeValue("422,79"), 422.79);
  assert.equal(parseMoneyLikeValue("1.234,56"), 1234.56);
  assert.equal(parseMoneyLikeValue("422.79"), 422.79);
  assert.equal(parseMoneyLikeValue("R$ 422,79"), 422.79);
});

test("compra cartao dialog: metade fecha total com arredondamento em centavos", () => {
  const preview = resolveReembolsoPreview({
    valorTotal: "422,79",
    reembolsoModo: "metade",
    reembolsoValorTotal: "",
    reembolsoPercentual: "",
  });

  assert.equal(preview.valorCompra, 422.79);
  assert.equal(preview.reembolsoPessoa, 211.4);
  assert.equal(preview.partePropria, 211.39);
  assert.equal(Number((preview.reembolsoPessoa + preview.partePropria).toFixed(2)), 422.79);
});

test("compra cartao dialog: valor personalizado não ultrapassa total ao calcular resumo", () => {
  const preview = resolveReembolsoPreview({
    valorTotal: "422,79",
    reembolsoModo: "valor_custom",
    reembolsoValorTotal: "500,00",
    reembolsoPercentual: "",
  });

  assert.equal(preview.reembolsoPessoa, 422.79);
  assert.equal(preview.partePropria, 0);
});

test("reembolso helper: compra sem pessoa vinculada retorna zero para a pessoa", () => {
  const breakdown = buildCompraReembolsoBreakdown({
    pessoaId: null,
    valorTotal: "422.79",
    parcelas: 1,
    parcelaAtual: 1,
    reembolsoModo: null,
  });

  assert.equal(breakdown.reembolsoPessoa, 0);
  assert.equal(breakdown.partePropria, 422.79);
});

test("reembolso helper: compra legada com pessoa e modo nulo mantém 100%", () => {
  const breakdown = buildCompraReembolsoBreakdown({
    pessoaId: "p-1",
    valorTotal: "422.79",
    parcelas: 1,
    parcelaAtual: 1,
    reembolsoModo: null,
  });

  assert.equal(breakdown.reembolsoPessoa, 422.79);
  assert.equal(breakdown.partePropria, 0);
});

test("reembolso helper: metade de 422,79 gera 211,40 para pessoa e 211,39 para minha parte", () => {
  const breakdown = buildCompraReembolsoBreakdown({
    pessoaId: "p-1",
    valorTotal: "422.79",
    parcelas: 1,
    parcelaAtual: 1,
    reembolsoModo: "metade",
  });

  assert.equal(breakdown.reembolsoPessoa, 211.4);
  assert.equal(breakdown.partePropria, 211.39);
  assert.equal(Number((breakdown.reembolsoPessoa + breakdown.partePropria).toFixed(2)), 422.79);
});

test("reembolso helper: metade em compra parcelada distribui por parcela", () => {
  const breakdown = buildCompraReembolsoBreakdown({
    pessoaId: "p-1",
    valorTotal: "1000.00",
    parcelas: 10,
    parcelaAtual: 5,
    reembolsoModo: "metade",
  });

  assert.equal(breakdown.reembolsoPessoa, 500);
  assert.equal(breakdown.reembolsoPorParcela[0], 50);
  assert.equal(breakdown.reembolsoPorParcela[9], 50);
});

test("cartoes api: valor total com vírgula não é serializado como inteiro sem centavos", () => {
  assert.equal(formatMoneyFixed("422,79"), "422.79");
  assert.equal(formatMoneyFixed("1.234,56"), "1234.56");
});

test("timeline utils: status define cores e labels corretos", () => {
  const pago = getTimelineStatusVisual("pago");
  assert.equal(pago.label, "Pago");
  assert.match(pago.dotClassName, /emerald/);
  assert.match(pago.badgeClassName, /emerald/);

  const vencido = getTimelineStatusVisual("vencido");
  assert.equal(vencido.label, "Vencido");
  assert.match(vencido.dotClassName, /red/);
  assert.match(vencido.badgeClassName, /red/);

  const pendente = getTimelineStatusVisual("pendente");
  assert.equal(pendente.label, "Pendente");
  assert.match(pendente.dotClassName, /amber/);
  assert.match(pendente.badgeClassName, /amber/);
});

test("timeline utils: detalhe do evento usa label de data correta", () => {
  assert.equal(
    toTimelineDateLabel({
      id: "evt-1",
      sourceType: "parcela",
      sourceId: "parcela-1",
      dividaId: "divida-1",
      tipoDivida: "receber",
      titulo: "Teste pago",
      kind: "pagamento_realizado",
      status: "pago",
      dataEvento: "2026-04-20",
      dataPagamento: "2026-04-20",
      dataVencimento: "2026-04-19",
      valor: "10.00",
      observacaoPagamento: null,
      comprovante: null,
    }),
    "Pagamento",
  );

  assert.equal(
    toTimelineDateLabel({
      id: "evt-2",
      sourceType: "divida",
      sourceId: "divida-2",
      dividaId: "divida-2",
      tipoDivida: "pagar",
      titulo: "Teste vencido",
      kind: "pagamento_vencido",
      status: "vencido",
      dataEvento: "2026-04-10",
      dataPagamento: null,
      dataVencimento: "2026-04-10",
      valor: "25.00",
      observacaoPagamento: null,
      comprovante: null,
    }),
    "Vencimento",
  );
});

test("timeline utils: formata tamanho de comprovante", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1.0 KB");
});

test("timeline utils: distribui eventos em ordem cronologica no eixo horizontal", () => {
  const timeline = buildTimelineLayout([
    {
      id: "evt-3",
      sourceType: "divida",
      sourceId: "divida-3",
      dividaId: "divida-3",
      tipoDivida: "pagar",
      titulo: "Evento C",
      kind: "pagamento_vencido",
      status: "vencido",
      dataEvento: "2026-06-10",
      dataPagamento: null,
      dataVencimento: "2026-06-10",
      valor: "300.00",
      observacaoPagamento: null,
      comprovante: null,
    },
    {
      id: "evt-1",
      sourceType: "parcela",
      sourceId: "parcela-1",
      dividaId: "divida-1",
      tipoDivida: "receber",
      titulo: "Evento A",
      kind: "pagamento_realizado",
      status: "pago",
      dataEvento: "2026-04-10",
      dataPagamento: "2026-04-10",
      dataVencimento: "2026-04-09",
      valor: "100.00",
      observacaoPagamento: null,
      comprovante: null,
    },
    {
      id: "evt-2",
      sourceType: "parcela",
      sourceId: "parcela-2",
      dividaId: "divida-2",
      tipoDivida: "receber",
      titulo: "Evento B",
      kind: "pagamento_pendente",
      status: "pendente",
      dataEvento: "2026-05-10",
      dataPagamento: null,
      dataVencimento: "2026-05-10",
      valor: "200.00",
      observacaoPagamento: null,
      comprovante: null,
    },
  ]);

  assert.equal(timeline.items.length, 3);
  assert.equal(timeline.items[0]?.event.id, "evt-1");
  assert.equal(timeline.items[1]?.event.id, "evt-2");
  assert.equal(timeline.items[2]?.event.id, "evt-3");
  assert.ok((timeline.items[0]?.x ?? 0) < (timeline.items[1]?.x ?? 0));
  assert.ok((timeline.items[1]?.x ?? 0) < (timeline.items[2]?.x ?? 0));
});

test("timeline utils: largura cresce para suportar muitos eventos com scroll horizontal", () => {
  const widthWithTwo = getTimelineCanvasWidth(2);
  const widthWithTwelve = getTimelineCanvasWidth(12);
  assert.ok(widthWithTwelve > widthWithTwo);
  assert.ok(widthWithTwo >= 720);
});

test("timeline utils: chave selecionada encontra evento correto para abrir detalhe", () => {
  const events = [
    {
      id: "evt-1",
      sourceType: "parcela",
      sourceId: "parcela-1",
      dividaId: "divida-1",
      tipoDivida: "receber",
      titulo: "Evento A",
      kind: "pagamento_realizado",
      status: "pago",
      dataEvento: "2026-04-10",
      dataPagamento: "2026-04-10",
      dataVencimento: "2026-04-09",
      valor: "100.00",
      observacaoPagamento: "obs A",
      comprovante: null,
    },
    {
      id: "evt-2",
      sourceType: "divida",
      sourceId: "divida-2",
      dividaId: "divida-2",
      tipoDivida: "pagar",
      titulo: "Evento B",
      kind: "pagamento_vencido",
      status: "vencido",
      dataEvento: "2026-05-10",
      dataPagamento: null,
      dataVencimento: "2026-05-10",
      valor: "200.00",
      observacaoPagamento: null,
      comprovante: {
        nome: "comp.pdf",
        mimeType: "application/pdf",
        tamanho: 1280,
        downloadUrl: "/api/pagamentos/divida/divida-2/comprovante",
      },
    },
  ] as const;

  const selectedKey = getTimelineEventKey(events[1]);
  const selected = findSelectedTimelineEvent([...events], selectedKey);
  assert.equal(selected?.id, "evt-2");
});

test("import parser: data dd/mm usa ano da fatura quando informado", () => {
  const input = [
    "Vencimento 20/05/2026",
    "06/05 MERCADO CENTRAL 90,00 1/1",
  ].join("\n");

  const result = parseCsv(input, [], "cartao-1", { referenceBillingDate: "2026-05-20" });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.dataCompra, "2026-05-06");
});

test("import parser: valor pt-BR e en-US sao reconhecidos", () => {
  const csvBr = [
    "Data;Descricao;Valor",
    "06/05/2026;Padaria;1.234,56",
  ].join("\n");
  const csvUs = [
    "Date,Title,Amount",
    "2026-05-06,Store,\"1,234.56\"",
  ].join("\n");

  const parsedBr = parseCsv(csvBr, [], "cartao-1");
  const parsedUs = parseCsv(csvUs, [], "cartao-1");

  assert.equal(parsedBr.items[0]?.valorParcela, 1234.56);
  assert.equal(parsedUs.items[0]?.valorParcela, 1234.56);
});

test("import parser: detecta parcelas em formatos comuns", () => {
  const input = [
    "Vencimento 20/05/2026",
    "06/05 Loja Tech parcela 3 de 10 120,00",
    "07/05 Fone bluetooth 10x 80,00",
  ].join("\n");

  const result = parseCsv(input, [], "cartao-1", { referenceBillingDate: "2026-05-20" });
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.parcelaAtual, 3);
  assert.equal(result.items[0]?.parcelas, 10);
  assert.equal(result.items[1]?.parcelas, 10);
  assert.equal(result.items[1]?.parcelaAtual, 1);
  assert.equal(result.items[1]?.reviewRequired, true);
});

test("import parser: detecta assinatura textual da fatura Nubank e ano de referencia", () => {
  const pdfText = [
    "Olá, Fernando. Esta é a sua fatura de abril, no valor de R$ 1.756,32",
    "FATURA 24 ABR 2026",
    "RESUMO DA FATURA ATUAL",
    "TRANSAÇÕES DE 17 MAR A 17 ABR",
  ].join("\n");

  assert.equal(detectNubankInvoiceText(pdfText), true);
  assert.equal(detectInvoiceIssuerForPdfText(pdfText), "nubank");
  assert.equal(extractNubankInvoiceYear(pdfText), 2026);
});

test("import parser: detecta assinatura textual da fatura Itau", () => {
  const pdfText = [
    "Cartao Itaucard",
    "Resumo da fatura em R$",
    "Lancamentos: compras e saques",
    "Limite total de credito",
  ].join("\n");

  assert.equal(detectItauInvoiceText(pdfText), true);
  assert.equal(detectInvoiceIssuerForPdfText(pdfText), "itau");
});

test("import parser: detecta Itau mesmo com texto quebrado por acentos/espacos", () => {
  const pdfText = [
    "Itaúcard",
    "Lan ç amentos: compras e saques",
    "Compras parceladas - pr ó ximas faturas",
    "Limite de cr é dito",
    "4004 4828",
    "0800 970 4828",
  ].join("\n");

  assert.equal(detectItauInvoiceText(pdfText), true);
  assert.equal(detectInvoiceIssuerForPdfText(pdfText), "itau");
});

test("import parser: detecta assinatura textual da fatura Mercado Pago", () => {
  const pdfText = [
    "Mercado Pago",
    "Essa é sua fatura",
    "Detalhes de consumo",
    "Cartão Visa [************4733]",
    "Data Movimentações Valor em R$",
    "Pague sua fatura pelo app Mercado Pago",
  ].join("\n");

  assert.equal(detectMercadoPagoInvoiceText(pdfText), true);
  assert.equal(detectInvoiceIssuerForPdfText(pdfText), "mercado_pago");
});

test("import parser: registry lista parser Nubank e prepara emissores futuros", () => {
  const registered = getRegisteredInvoiceParsers();
  assert.equal(registered.length >= 3, true);
  assert.equal(registered.some((parser) => parser.issuer === "itau"), true);
  assert.equal(registered.some((parser) => parser.parserName === "itau_textual_pdf"), true);
  assert.equal(registered.some((parser) => parser.issuer === "mercado_pago"), true);
  assert.equal(registered.some((parser) => parser.parserName === "mercado_pago_textual_pdf"), true);
  assert.equal(registered.some((parser) => parser.issuer === "nubank"), true);
  assert.equal(registered.some((parser) => parser.parserName === "nubank_textual_pdf"), true);

  const planned = getPlannedInvoiceIssuers();
  assert.equal(planned.includes("nubank"), true);
  assert.equal(planned.includes("itau"), true);
  assert.equal(planned.includes("mercado_pago"), true);
  assert.equal(planned.includes("c6"), true);
  assert.equal(planned.includes("santander"), true);
  assert.equal(planned.includes("bradesco"), true);
  assert.equal(planned.includes("banco_do_brasil"), true);
});

test("import parser: PDF Nubank importa apenas linhas reais da seção de transações", () => {
  const pdfText = [
    "Olá, Fernando. Esta é a sua fatura de abril, no valor de R$ 1.756,32",
    "FATURA 24 ABR 2026",
    "Fatura anterior R$ 1.423,13",
    "Pagamento recebido −R$ 1.623,13",
    "Total a pagar R$ 1.756,32",
    "Limite total R$ 3.291,33 R$ 4.050,00",
    "FERNANDO QUINTELA BANDEIRA",
    "TRANSAÇÕES DE 17 MAR A 17 ABR",
    "17 MAR Mad Vestuario - Parcela 2/2 R$ 163,42",
    "17 MAR Amazonmktplc*Ikaraindu - Parcela 5/10 R$ 53,01",
    "Pagamento em 20 MAR −R$ 1.300,00",
    "01 ABR Mp *Hasag - Parcela 1/2 R$ 229,68",
    "12 ABR Dl*Uberrides R$ 37,94",
    "Em cumprimento à regulação vigente, consulte o Registrato.",
    "O Nubank declara que...",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-1");
  assert.equal(result.items.length, 4);

  const descriptions = result.items.map((item) => item.descricao.toLowerCase());
  assert.equal(descriptions.some((value) => value.includes("ola, fernando")), false);
  assert.equal(descriptions.some((value) => value.includes("total a pagar")), false);
  assert.equal(descriptions.some((value) => value.includes("fatura anterior")), false);
  assert.equal(descriptions.some((value) => value.includes("pagamento em")), false);
  assert.equal(descriptions.some((value) => value.includes("limite total")), false);
  assert.equal(descriptions.some((value) => value.includes("pagamento recebido")), false);

  const parcela2de2 = result.items.find((item) => item.descricao.toLowerCase().includes("mad vestuario"));
  assert.ok(parcela2de2);
  assert.equal(parcela2de2?.parcelaAtual, 2);
  assert.equal(parcela2de2?.parcelas, 2);
  assert.equal(parcela2de2?.dataCompra, "2026-03-17");
  assert.equal(parcela2de2?.valorParcela, 163.42);

  const parcela5de10 = result.items.find((item) => item.descricao.toLowerCase().includes("amazonmktplc"));
  assert.ok(parcela5de10);
  assert.equal(parcela5de10?.parcelaAtual, 5);
  assert.equal(parcela5de10?.parcelas, 10);
  assert.equal(parcela5de10?.dataCompra, "2026-03-17");
  assert.equal(parcela5de10?.valorParcela, 53.01);

  const parcela1de2 = result.items.find((item) => item.descricao.toLowerCase().includes("mp hasag"));
  assert.ok(parcela1de2);
  assert.equal(parcela1de2?.parcelaAtual, 1);
  assert.equal(parcela1de2?.parcelas, 2);
  assert.equal(parcela1de2?.dataCompra, "2026-04-01");

  const compraAvista = result.items.find((item) => item.descricao.toLowerCase().includes("dl uberrides"));
  assert.ok(compraAvista);
  assert.equal(compraAvista?.parcelaAtual, 1);
  assert.equal(compraAvista?.parcelas, 1);
  assert.equal(compraAvista?.valorParcela, 37.94);
});

test("import parser: PDF Itau importa apenas lancamentos reais da secao de compras e saques", () => {
  const pdfText = [
    "Itaucard",
    "Resumo da fatura em R$",
    "Pagamento via conta -924,85",
    "Total dos pagamentos -924,85",
    "Vencimento 22/04/2026",
    "Emissao 14/04/2026",
    "Lancamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "04/09 Shopee*SHOPEE* 08/12 224,91",
    "18/09 EC *LGELECTRON 07/12 410,67",
    "11/12 PG *WEBFONES W 05/06 108,16",
    "25/03 NETFLIX ENTRETENIMENTOB 59,90",
    "25/03 EBN *PLAYST 01/02 99,59",
    "02/04 EBN *PLAYST 01/04 21,62",
    "Total dos lancamentos atuais 0,00",
    "Compras parceladas - proximas faturas",
    "Proxima fatura",
    "Limite total de credito",
    "Encargos cobrados nesta fatura",
    "Juros",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-itau", { referenceBillingDate: "2026-04-22" });
  assert.equal(result.issuerDetected, "itau");
  assert.equal(result.parserUsed, "itau_textual_pdf");
  assert.equal(result.items.length, 6);

  const descriptions = result.items.map((item) => item.descricao.toLowerCase());
  assert.equal(descriptions.some((value) => value.includes("pagamento via conta")), false);
  assert.equal(descriptions.some((value) => value.includes("total dos pagamentos")), false);
  assert.equal(descriptions.some((value) => value.includes("total dos lancamentos atuais")), false);
  assert.equal(descriptions.some((value) => value.includes("proxima fatura")), false);
  assert.equal(descriptions.some((value) => value.includes("limite total")), false);

  const shopee = result.items.find((item) => item.descricao.toLowerCase().includes("shopee"));
  assert.ok(shopee);
  assert.equal(shopee?.parcelaAtual, 8);
  assert.equal(shopee?.parcelas, 12);
  assert.equal(shopee?.valorParcela, 224.91);
  assert.equal(shopee?.dataCompra, "2025-09-04");

  const lge = result.items.find((item) => item.descricao.toLowerCase().includes("lgelectron"));
  assert.ok(lge);
  assert.equal(lge?.parcelaAtual, 7);
  assert.equal(lge?.parcelas, 12);
  assert.equal(lge?.dataCompra, "2025-09-18");

  const webfones = result.items.find((item) => item.descricao.toLowerCase().includes("webfones"));
  assert.ok(webfones);
  assert.equal(webfones?.parcelaAtual, 5);
  assert.equal(webfones?.parcelas, 6);
  assert.equal(webfones?.dataCompra, "2025-12-11");

  const netflix = result.items.find((item) => item.descricao.toLowerCase().includes("netflix"));
  assert.ok(netflix);
  assert.equal(netflix?.parcelaAtual, 1);
  assert.equal(netflix?.parcelas, 1);
  assert.equal(netflix?.dataCompra, "2026-03-25");

  const playst = result.items.find((item) => item.descricao.toLowerCase().includes("playst"));
  assert.ok(playst);
  assert.equal(playst?.dataCompra, "2026-03-25");

  const playstAbr = result.items.find((item) => item.dataCompra === "2026-04-02");
  assert.ok(playstAbr);
});

test("import parser: PDF Itau com texto quebrado importa compras reais e ignora blocos de resumo", () => {
  const pdfText = [
    "Estamos lhe enviando esta para simples confer ê ncia...",
    "Limite de cr é dito R$ 2.900,00",
    "Itaúcard",
    "Lan ç amentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "25/03 NETFLIX ENTRETENIMENTOB 59,90",
    "02/04 EBN *PLAYST 01/04 21,62",
    "4004 4828 0800 970 4828 P L Pagamentos efetuados EM Pagamento via conta -924,85",
    "Compras parceladas - pr ó ximas faturas",
    "Demais faturas 1.910,79",
    "Simula çã o de Compras parc. c/ juros e Credi á rio",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-itau", { referenceBillingDate: "2026-04-22" });
  assert.equal(result.issuerDetected, "itau");
  assert.equal(result.parserUsed, "itau_textual_pdf");
  assert.equal(result.items.length, 2);
  assert.equal(result.items.some((item) => item.valorParcela === 2900), false);
  assert.equal(result.items.some((item) => item.valorParcela === 1910.79), false);
  assert.equal(result.items.some((item) => item.descricao.toLowerCase().includes("estamos lhe enviando")), false);
  assert.equal(result.items.some((item) => item.descricao.toLowerCase().includes("simulacao")), false);
});

test("import parser: PDF Itau sem datas nao cai no generico e retorna warning seguro", () => {
  const pdfText = [
    "Itaúcard",
    "Lan ç amentos: compras e saques",
    "NETFLIX ENTRETENIMENTOB 59,90",
    "EBN *PLAYST 01/04 21,62",
    "Compras parceladas - pr ó ximas faturas",
    "Demais faturas 1.910,79",
    "Limite de cr é dito R$ 2.900,00",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-itau", { referenceBillingDate: "2026-04-22" });
  assert.equal(result.issuerDetected, "itau");
  assert.equal(result.parserUsed, "itau_textual_pdf");
  assert.equal(result.items.length, 0);
  assert.equal(result.parserWarnings?.some((warning) => warning.toLowerCase().includes("parece ser itau")), true);
});

test("import parser: PDF Itau com linhas coladas ainda extrai 6 compras reais", () => {
  const collapsedSectionLine = [
    "04/09 Shopee*SHOPEE* 08/12 224,91",
    "18/09 EC *LGELECTRON 07/12 410,67",
    "11/12 PG *WEBFONES W 05/06 108,16",
    "25/03 NETFLIX ENTRETENIMENTOB 59,90",
    "25/03 EBN *PLAYST 01/02 99,59",
    "02/04 EBN *PLAYST 01/04 21,62",
    "Compras parceladas - proximas faturas",
    "Demais faturas 1.910,79",
  ].join(" ");

  const pdfText = [
    "Itaúcard",
    "Resumo da fatura em R$",
    "Pagamento via conta -924,85",
    "Vencimento 22/04/2026",
    "Lançamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    collapsedSectionLine,
    "Limites de crédito",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-itau", { referenceBillingDate: "2026-04-22" });
  assert.equal(result.issuerDetected, "itau");
  assert.equal(result.parserUsed, "itau_textual_pdf");
  assert.equal(result.items.length, 6);
  assert.equal(result.items.some((item) => item.valorParcela === 1910.79), false);
  assert.equal(result.items.some((item) => item.descricao.toLowerCase().includes("demais faturas")), false);
  assert.equal(result.items.some((item) => item.descricao.toLowerCase().includes("pagamento via conta")), false);
});

test("import parser: seção Itau não encerra em linha auxiliar 'outros' e só termina em marcador oficial", () => {
  const pdfText = [
    "Itaúcard",
    "Resumo da fatura em R$",
    "Vencimento 22/04/2026",
    "Lançamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "04/09 Shopee*SHOPEE* 08/12 224,91",
    "outros Guarulhos",
    "18/09 EC *LGELECTRON 07/12 410,67",
    "ELETRONICS TAUBATE",
    "11/12 PG *WEBFONES W 05/06 108,16",
    "outros SAO PAULO",
    "25/03 NETFLIX ENTRETENIMENTOB 59,90",
    "25/03 EBN *PLAYST 01/02 99,59",
    "02/04 EBN *PLAYST 01/04 21,62",
    "Compras parceladas - próximas faturas",
    "Demais faturas 1.910,79",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-itau", { referenceBillingDate: "2026-04-22", issuerHint: "itau" });
  assert.equal(result.items.length, 6);
  assert.equal(result.items.some((item) => item.valorParcela === 1910.79), false);
});

test("import parser: PDF Itau ignora seção de compras parceladas - próximas faturas", () => {
  const pdfText = [
    "Itaúcard",
    "Resumo da fatura em R$",
    "Vencimento 22/04/2026",
    "Lançamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "04/09 Shopee*SHOPEE* 08/12 224,91",
    "18/09 EC *LGELECTRON 07/12 410,67",
    "11/12 PG *WEBFONES W 05/06 108,16",
    "25/03 NETFLIX ENTRETENIMENTOB 59,90",
    "25/03 EBN *PLAYST 01/02 99,59",
    "02/04 EBN *PLAYST 01/04 21,62 Compras parceladas - próximas faturas 04/09 Shopee*SHOPEE* 09/12 224,91",
    "18/09 EC *LGELECTRON 08/12 410,67",
    "11/12 PG *WEBFONES W 06/06 108,16",
    "25/03 EBN *PLAYST 02/02 99,59",
    "02/04 EBN *PLAYST 02/04 21,62",
    "Total para próximas faturas 1.910,79",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-itau", { referenceBillingDate: "2026-04-22", issuerHint: "itau" });

  assert.equal(result.items.length, 6);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("SHOPEE") && item.parcelaAtual === 9), false);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("LGELECTRON") && item.parcelaAtual === 8), false);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("WEBFONES") && item.parcelaAtual === 6), false);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("PLAYST") && item.parcelaAtual === 2 && item.parcelas === 2), false);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("PLAYST") && item.parcelaAtual === 2 && item.parcelas === 4), false);

  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("SHOPEE") && item.parcelaAtual === 8), true);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("LGELECTRON") && item.parcelaAtual === 7), true);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("WEBFONES") && item.parcelaAtual === 5), true);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("NETFLIX")), true);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("PLAYST") && item.parcelaAtual === 1 && item.parcelas === 2), true);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("PLAYST") && item.parcelaAtual === 1 && item.parcelas === 4), true);
});

test("import parser: Itau usa fallback plain quando extração posicional vier incompleta", () => {
  const positionalIncomplete = [
    "Itaúcard",
    "Lançamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    ".",
    "04/09 Shopee*SHOPEE* 08/12 224,91",
    "outros Guarulhos",
  ].join("\n");

  const plainFallback = [
    "Itaúcard",
    "Resumo da fatura em R$",
    "Vencimento 22/04/2026",
    "Lançamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "04/09 Shopee*SHOPEE* 08/12 224,91",
    "18/09 EC *LGELECTRON 07/12 410,67",
    "11/12 PG *WEBFONES W 05/06 108,16",
    "25/03 NETFLIX ENTRETENIMENTOB 59,90",
    "25/03 EBN *PLAYST 01/02 99,59",
    "02/04 EBN *PLAYST 01/04 21,62",
    "Compras parceladas - próximas faturas",
  ].join("\n");

  const result = parsePdf(positionalIncomplete, [], "cartao-itau", {
    referenceBillingDate: "2026-04-22",
    issuerHint: "itau",
    itauFallbackContent: plainFallback,
  });
  assert.equal(result.items.length, 6);
  assert.equal(result.parserUsed, "itau_textual_pdf_fallback_plain");
});

test("import parser: PDF Mercado Pago importa apenas compras reais da seção de detalhes de consumo", () => {
  const pdfText = [
    "Mercado Pago",
    "Essa é sua fatura",
    "Emitido em: 13/05/2026",
    "Vencimento: 18/05/2026",
    "Resumo da fatura",
    "Total a pagar R$ 851,00",
    "Pagamento mínimo R$ 127,65",
    "Detalhes de consumo",
    "Cartão Visa [************4733]",
    "Data Movimentações Valor em R$",
    "18/03 NFS ZONA NORTE Parcela 2 de 2 R$ 179,99",
    "18/04 SUELI CABELEIREIROS R$ 135,00",
    "18/04 AdimilsonDos R$ 20,00",
    "18/04 DIMONTAO COMERCIO ALI R$ 18,00",
    "19/04 MINUTO PA 1478@@@@@@@@ R$ 18,40",
    "21/04 DIA BRASIL LJ 430 R$ 47,87",
    "08/05 AutoMotoEscola Parcela 1 de 2 R$ 250,00",
    "Total R$ 669,26",
    "Cartão Visa [************9064]",
    "Data Movimentações Valor em R$",
    "24/12 MLP*KaBuM KaBuM Parcela 5 de 10 R$ 157,58",
    "24/12 EC *MERCADOLIVRE Parcela 5 de 7 R$ 24,16",
    "Total R$ 181,74",
    "Parcele a fatura",
    "Limite utilizado R$ 1.937,22",
    "Compras parceladas R$ 1.086,23",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-mp", {
    referenceBillingDate: "2026-05-18",
  });

  assert.equal(result.issuerDetected, "mercado_pago");
  assert.equal(result.parserUsed, "mercado_pago_textual_pdf");
  assert.equal(result.items.length, 9);
  const uniqueLast4 = Array.from(new Set(result.items.map((item) => item.cardLast4).filter(Boolean)));
  assert.deepEqual(uniqueLast4, ["4733", "9064"]);

  const descriptions = result.items.map((item) => item.descricao.toLowerCase());
  assert.equal(descriptions.some((value) => value.includes("total a pagar")), false);
  assert.equal(descriptions.some((value) => value.includes("pagamento minimo")), false);
  assert.equal(descriptions.some((value) => value.includes("limite utilizado")), false);
  assert.equal(descriptions.some((value) => value.includes("compras parceladas")), false);
  assert.equal(descriptions.some((value) => value.includes("total r$")), false);

  const nfs = result.items.find((item) => item.descricao.toLowerCase().includes("nfs zona norte"));
  assert.ok(nfs);
  assert.equal(nfs?.parcelaAtual, 2);
  assert.equal(nfs?.parcelas, 2);
  assert.equal(nfs?.valorParcela, 179.99);
  assert.equal(nfs?.dataCompra, "2026-03-18");

  const automoto = result.items.find((item) => item.descricao.toLowerCase().includes("automotoescola"));
  assert.ok(automoto);
  assert.equal(automoto?.parcelaAtual, 1);
  assert.equal(automoto?.parcelas, 2);
  assert.equal(automoto?.dataCompra, "2026-05-08");

  const minuto = result.items.find((item) => item.descricao.toLowerCase().includes("minuto pa 1478"));
  assert.ok(minuto);
  assert.equal(minuto?.descricao.includes("@"), false);

  const kabum = result.items.find((item) => item.descricao.toLowerCase().includes("kabum"));
  assert.ok(kabum);
  assert.equal(kabum?.descricao.toLowerCase().includes("mlp kabum"), true);
  assert.equal(kabum?.parcelaAtual, 5);
  assert.equal(kabum?.parcelas, 10);
  assert.equal(kabum?.valorParcela, 157.58);
  assert.equal(kabum?.dataCompra, "2025-12-24");

  const mercadoLivre = result.items.find((item) => item.descricao.toLowerCase().includes("mercadolivre"));
  assert.ok(mercadoLivre);
  assert.equal(mercadoLivre?.descricao.toLowerCase().includes("ec mercadolivre"), true);
  assert.equal(mercadoLivre?.parcelaAtual, 5);
  assert.equal(mercadoLivre?.parcelas, 7);
  assert.equal(mercadoLivre?.dataCompra, "2025-12-24");
  assert.equal(mercadoLivre?.cardLast4, "9064");
});

test("import parser: Mercado Pago detectado sem transações não cai no genérico e retorna warning seguro", () => {
  const pdfText = [
    "Mercado Pago",
    "Essa é sua fatura",
    "Emitido em: 13/05/2026",
    "Detalhes de consumo",
    "Cartão Visa [************4733]",
    "Data Movimentações Valor em R$",
    "Total R$ 0,00",
    "Parcele a fatura",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-mp", {
    referenceBillingDate: "2026-05-18",
  });

  assert.equal(result.issuerDetected, "mercado_pago");
  assert.equal(result.parserUsed, "mercado_pago_textual_pdf");
  assert.equal(result.items.length, 0);
  assert.equal(
    result.parserWarnings?.some((warning) => warning.toLowerCase().includes("mercado pago")),
    true,
  );
});

test("import parser: Mercado Pago marca duplicata quando compra igual já existe", () => {
  const pdfText = [
    "Mercado Pago",
    "Essa é sua fatura",
    "Emitido em: 13/05/2026",
    "Vencimento: 18/05/2026",
    "Detalhes de consumo",
    "Cartão Visa [************4733]",
    "Data Movimentações Valor em R$",
    "18/04 SUELI CABELEIREIROS R$ 135,00",
    "Total R$ 135,00",
  ].join("\n");

  const existentes: CompraCartao[] = [
    {
      id: "compra-existente-1",
      userId: "user-1",
      cartaoId: "cartao-mp",
      descricao: "Sueli Cabeleireiros",
      valorTotal: "135.00",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "135.00",
      dataCompra: "2026-04-18",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
  ];

  const parsed = parseMercadoPagoInvoiceText(pdfText, {
    existentes,
    cartaoId: "cartao-mp",
    referenceBillingDate: "2026-05-18",
    selectedCardName: "Mercado Pago Visa final 4733",
  });

  assert.equal(parsed.length, 1);
  assert.ok(parsed[0]?.duplicata);
  assert.equal(parsed[0]?.action, "skip");
});

test("import parser: Mercado Pago não marca duplicata exata com mesmo valor quando descrição e data divergem", () => {
  const pdfText = [
    "Mercado Pago",
    "Essa é sua fatura",
    "Emitido em: 13/05/2026",
    "Vencimento: 18/05/2026",
    "Detalhes de consumo",
    "Cartão Visa [************4733]",
    "Data Movimentações Valor em R$",
    "18/04 SUELI CABELEIREIROS R$ 135,00",
    "Total R$ 135,00",
  ].join("\n");

  const existentes: CompraCartao[] = [
    {
      id: "compra-existente-2",
      userId: "user-1",
      cartaoId: "cartao-mp",
      descricao: "Posto Central",
      valorTotal: "135.00",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "135.00",
      dataCompra: "2026-04-10",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
  ];

  const parsed = parseMercadoPagoInvoiceText(pdfText, {
    existentes,
    cartaoId: "cartao-mp",
    referenceBillingDate: "2026-05-18",
    selectedCardName: "Mercado Pago Visa final 4733",
  });

  assert.equal(parsed.length, 1);
  assert.equal(Boolean(parsed[0]?.duplicata), false);
  assert.equal(parsed[0]?.action, "import");
});

test("import parser: Mercado Pago mantém dedupe quando cardLast4 estiver ausente", () => {
  const pdfText = [
    "Mercado Pago",
    "Essa é sua fatura",
    "Emitido em: 13/05/2026",
    "Vencimento: 18/05/2026",
    "Detalhes de consumo",
    "Cartão Visa [************]",
    "Data Movimentações Valor em R$",
    "18/04 SUELI CABELEIREIROS R$ 135,00",
    "Total R$ 135,00",
  ].join("\n");

  const existentes: CompraCartao[] = [
    {
      id: "compra-existente-3",
      userId: "user-1",
      cartaoId: "cartao-mp",
      descricao: "Sueli Cabeleireiros",
      valorTotal: "135.00",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "135.00",
      dataCompra: "2026-04-18",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    },
  ];

  const parsed = parseMercadoPagoInvoiceText(pdfText, {
    existentes,
    cartaoId: "cartao-mp",
    referenceBillingDate: "2026-05-18",
    selectedCardName: "Mercado Pago Visa",
  });

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.cardLast4 ?? null, null);
  assert.ok(parsed[0]?.duplicata);
  assert.equal(parsed[0]?.action, "skip");
});

test("import parser: PDF desconhecido usa parser generico com revisão obrigatoria", () => {
  const pdfText = [
    "Fatura do Cartao XPTO",
    "12/04 MERCADO CENTRAL 90,00 1/1",
    "13/04 PADARIA DO BAIRRO 25,00",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-1", {
    referenceBillingDate: "2026-04-20",
  });

  assert.equal(result.issuerDetected, "unknown");
  assert.equal(result.parserUsed, "generic_pdf_fallback");
  assert.equal(result.items.length, 2);
  assert.equal(result.items.every((item) => item.reviewRequired === true), true);
  assert.equal(
    result.items.every((item) =>
      (item.validationIssues ?? []).some((issue) =>
        issue.toLowerCase().includes("emissor da fatura nao identificado"),
      ),
    ),
    true,
  );
});

test("import parser: parser generico ignora bloco gigante de resumo com palavras sensiveis", () => {
  const hugeNoise = `Resumo da fatura em R$ Total desta fatura Limite total de credito Simulacao de crediario Telefone 4004 4828 0800 970 4828 ${
    "x".repeat(220)
  } 2.900,00`;
  const pdfText = [
    "Fatura banco desconhecido",
    hugeNoise,
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-unknown", { referenceBillingDate: "2026-04-22" });
  assert.equal(result.issuerDetected, "unknown");
  assert.equal(result.items.length, 0);
});

test("import parser: OFX e QFX continuam funcionando via parseOfx", () => {
  const content = [
    "<OFX>",
    "<STMTTRN>",
    "<TRNTYPE>DEBIT",
    "<DTPOSTED>20260412",
    "<TRNAMT>37.94",
    "<MEMO>Dl*Uberrides",
    "</STMTTRN>",
  ].join("\n");

  const parsedOfx = parseOfx(content, [], "cartao-1");
  const parsedQfx = parseOfx(content, [], "cartao-1");

  assert.equal(parsedOfx.items.length, 1);
  assert.equal(parsedQfx.items.length, 1);
  assert.equal(parsedOfx.items[0]?.descricao.toLowerCase().includes("uberrides"), true);
  assert.equal(parsedQfx.items[0]?.descricao.toLowerCase().includes("uberrides"), true);
});

test("import parser: CSV Itau ignora pagamento negativo, limpa sufixo de cidade/UF e importa compras positivas", () => {
  const csv = [
    "data,lançamento,valor",
    "2026-04-07,PAGAMENTO COM SALDO,-924.85",
    "2026-04-02,EBN *PLAYSTATIONCURITIBABR,21.62",
    "2026-03-25,NETFLIX ENTRETENIMENTOBARUERIBR,59.9",
    "2026-03-24,EC *LGELECTRONICSTAUBATEBR,410.67",
    "2026-03-23,PG *WEBFONES WEBFSAO PAULOBR,108.16",
    "2026-03-22,SHOPEE*SHOPEE* IFGUARULHOSBR,224.91",
    "2026-03-21,BARUERI SHOPPING CENTER,80.00",
  ].join("\n");

  const parsed = parseCsv(csv, [], "cartao-itau");
  assert.equal(parsed.issuerDetected, "itau");
  assert.equal(parsed.parserUsed, "itau_csv");
  assert.equal(parsed.items.length, 6);
  assert.equal(parsed.items.some((item) => item.descricao.toLowerCase().includes("pagamento com saldo")), false);

  const playstation = parsed.items.find((item) => item.dataCompra === "2026-04-02");
  assert.equal(playstation?.descricao, "Ebn Playstation");

  const netflix = parsed.items.find((item) => item.dataCompra === "2026-03-25");
  assert.equal(netflix?.descricao, "Netflix Entretenimento");

  const lge = parsed.items.find((item) => item.dataCompra === "2026-03-24");
  assert.equal(lge?.descricao, "Ec Lgelectronics");

  const webfones = parsed.items.find((item) => item.dataCompra === "2026-03-23");
  assert.equal(webfones?.descricao, "Pg Webfones Webf");

  const shopee = parsed.items.find((item) => item.dataCompra === "2026-03-22");
  assert.equal(shopee?.descricao, "Shopee Shopee If");

  const nonSuffixCase = parsed.items.find((item) => item.dataCompra === "2026-03-21");
  assert.equal(nonSuffixCase?.descricao, "Barueri Shopping Center");
});

test("import parser: deduplicação considera descrição CSV Itau normalizada", () => {
  const csv = [
    "data,lançamento,valor",
    "2026-03-25,NETFLIX ENTRETENIMENTOBARUERIBR,59.90",
  ].join("\n");

  const existentes = [{
    id: "compra-1",
    userId: "user-1",
    cartaoId: "cartao-itau",
    descricao: "Netflix Entretenimento",
    valorTotal: "59.90",
    parcelas: 1,
    parcelaAtual: 1,
    valorParcela: "59.90",
    dataCompra: "2026-03-25",
    pessoaId: null,
    statusPessoa: null,
    dataPagamentoPessoa: null,
  }];

  const parsed = parseCsv(csv, existentes, "cartao-itau");
  assert.equal(parsed.items.length, 1);
  assert.ok(parsed.items[0]?.duplicata);
  assert.equal(parsed.items[0]?.action, "skip");
});

test("import parser: mismatch Nubank x Inter pode ser detectado pelo sugestor de emissor", () => {
  const cards = [
    {
      id: "cartao-inter",
      userId: "user-1",
      nome: "Inter",
      limite: "800.00",
      melhorDiaCompra: 5,
      diaVencimento: 10,
      iconeId: null,
    },
    {
      id: "cartao-nubank",
      userId: "user-1",
      nome: "Nubank Mastercard",
      limite: "3000.00",
      melhorDiaCompra: 10,
      diaVencimento: 20,
      iconeId: null,
    },
  ] as Cartao[];

  const suggestion = suggestImportCardByText("Nubank fatura de abril", cards);
  assert.equal(suggestion.kind, "single_match");
  if (suggestion.kind === "single_match") {
    assert.equal(suggestion.card.id, "cartao-nubank");
  }
});

test("import parser: texto Nubank com cartao Inter marca revisão forte", () => {
  const pdfText = [
    "FATURA 24 ABR 2026",
    "NUBANK",
    "TRANSAÇÕES DE 17 MAR A 17 ABR",
    "12 ABR Dl*Uberrides R$ 37,94",
  ].join("\n");

  const parsed = parseNubankInvoiceText(pdfText, {
    selectedCardName: "Inter",
    referenceBillingDate: "2026-04-24",
  });

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.reviewRequired, true);
  assert.equal(
    parsed[0]?.validationIssues?.some((issue) => issue.toLowerCase().includes("parece ser nubank")),
    true,
  );
});

test("import parser: texto Itau com cartao Inter marca revisão forte", () => {
  const pdfText = [
    "ITAUCARD",
    "Vencimento 22/04/2026",
    "Lancamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "02/04 EBN *PLAYST 01/04 21,62",
  ].join("\n");

  const parsed = parseItauInvoiceText(pdfText, {
    selectedCardName: "Inter",
    referenceBillingDate: "2026-04-22",
  });

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.reviewRequired, true);
  assert.equal(
    parsed[0]?.validationIssues?.some((issue) => issue.toLowerCase().includes("parece ser itau")),
    true,
  );
});

test("import parser: texto Mercado Pago com cartao Inter marca revisão forte", () => {
  const pdfText = [
    "Mercado Pago",
    "Essa é sua fatura",
    "Emitido em: 13/05/2026",
    "Detalhes de consumo",
    "Cartão Visa [************4733]",
    "Data Movimentações Valor em R$",
    "18/04 SUELI CABELEIREIROS R$ 135,00",
  ].join("\n");

  const parsed = parseMercadoPagoInvoiceText(pdfText, {
    selectedCardName: "Inter",
    referenceBillingDate: "2026-05-18",
  });

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.reviewRequired, true);
  assert.equal(
    parsed[0]?.validationIssues?.some((issue) => issue.toLowerCase().includes("parece ser mercado pago")),
    true,
  );
});

test("import parser: texto Mercado Pago com final incompatível marca revisão forte", () => {
  const pdfText = [
    "Mercado Pago",
    "Essa é sua fatura",
    "Emitido em: 13/05/2026",
    "Vencimento: 18/05/2026",
    "Detalhes de consumo",
    "Cartão Visa [************4733]",
    "Data Movimentações Valor em R$",
    "18/04 SUELI CABELEIREIROS R$ 135,00",
    "Cartão Visa [************9064]",
    "Data Movimentações Valor em R$",
    "24/12 EC *MERCADOLIVRE Parcela 5 de 7 R$ 24,16",
  ].join("\n");

  const parsed = parseMercadoPagoInvoiceText(pdfText, {
    selectedCardName: "Mercado Pago Visa final 1111",
    referenceBillingDate: "2026-05-18",
  });

  assert.equal(parsed.length, 2);
  assert.equal(parsed.every((item) => item.reviewRequired === true), true);
  assert.equal(
    parsed.every((item) =>
      (item.validationIssues ?? []).some((issue) =>
        issue.toLowerCase().includes("não parece corresponder a esses finais")
        || issue.toLowerCase().includes("nao parece corresponder a esses finais"),
      )),
    true,
  );
});

test("import parser: texto Mercado Pago com cartão compatível não força mismatch forte", () => {
  const pdfText = [
    "Mercado Pago",
    "Essa é sua fatura",
    "Emitido em: 13/05/2026",
    "Vencimento: 18/05/2026",
    "Detalhes de consumo",
    "Cartão Visa [************4733]",
    "Data Movimentações Valor em R$",
    "18/04 SUELI CABELEIREIROS R$ 135,00",
  ].join("\n");

  const parsed = parseMercadoPagoInvoiceText(pdfText, {
    selectedCardName: "Mercado Pago Visa final 4733",
    referenceBillingDate: "2026-05-18",
  });

  assert.equal(parsed.length, 1);
  assert.equal(
    parsed[0]?.validationIssues?.some((issue) =>
      issue.toLowerCase().includes("não parece corresponder a esses finais")
      || issue.toLowerCase().includes("nao parece corresponder a esses finais"),
    ) ?? false,
    false,
  );
});

test("import parser: detecta candidatos recorrentes de serviço com match forte", () => {
  const spotify = detectRecurringServiceCandidate("Dm*Spotify");
  const netflix = detectRecurringServiceCandidate("NETFLIX.COM");
  const seguro = detectRecurringServiceCandidate("Nu Seguro Vida");

  assert.equal(spotify.isServiceCandidate, true);
  assert.equal(spotify.matchedProvider, "Spotify");
  assert.equal(netflix.isServiceCandidate, true);
  assert.equal(netflix.matchedProvider, "Netflix");
  assert.equal(seguro.isServiceCandidate, true);
  assert.equal(seguro.categorySuggestion, "seguro");
});

test("import parser: nao marca compras comuns como serviço recorrente", () => {
  const uber = detectRecurringServiceCandidate("Uber Uber *Trip Help.U");
  const cinemark = detectRecurringServiceCandidate("Cinemark Brasil S.A Ec");
  const amazonCompra = detectRecurringServiceCandidate("Amazonmktplc*Ikaraindu");

  assert.equal(uber.isServiceCandidate, false);
  assert.equal(cinemark.isServiceCandidate, false);
  assert.equal(amazonCompra.isServiceCandidate, false);
});

test("import parser: candidato de serviço não cria vínculo automático", () => {
  const csv = [
    "Data;Descricao;Valor",
    "06/05/2026;DM*Spotify;21,90",
  ].join("\n");

  const parsed = parseCsv(csv, [], "cartao-1");
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0]?.recurringServiceCandidate?.isServiceCandidate, true);
  assert.equal(parsed.items[0]?.serviceSuggestionAction, "ignore");
  assert.equal(parsed.items[0]?.linkedServiceId, null);
});

test("import parser: valida assinatura magic bytes de PDF", () => {
  const validPdf = Buffer.from("%PDF-1.7\n1 0 obj\n");
  const invalidPdf = Buffer.from("NOTPDF");

  assert.equal(hasPdfMagicBytes(validPdf.buffer.slice(validPdf.byteOffset, validPdf.byteOffset + validPdf.byteLength)), true);
  assert.equal(hasPdfMagicBytes(invalidPdf.buffer.slice(invalidPdf.byteOffset, invalidPdf.byteOffset + invalidPdf.byteLength)), false);
});

test("import parser: detecta texto extraivel minimo de PDF", () => {
  assert.equal(isExtractedPdfTextUsable(""), false);
  assert.equal(isExtractedPdfTextUsable("    "), false);
  assert.equal(isExtractedPdfTextUsable("R$ 90,00"), false);
  assert.equal(isExtractedPdfTextUsable("06/05 Loja Central parcela 1/3 valor 120,00"), true);
});

test("import parser: reconstrói linhas posicionais por coordenada Y/X", () => {
  const items = [
    { str: "04", transform: [1, 0, 0, 1, 12, 700], width: 8, height: 10 },
    { str: "/", transform: [1, 0, 0, 1, 20.5, 700], width: 3, height: 10 },
    { str: "09", transform: [1, 0, 0, 1, 24, 700], width: 8, height: 10 },
    { str: "Shopee*SHOPEE*", transform: [1, 0, 0, 1, 40, 700], width: 78, height: 10 },
    { str: "08", transform: [1, 0, 0, 1, 122, 700], width: 8, height: 10 },
    { str: "/", transform: [1, 0, 0, 1, 130.5, 700], width: 3, height: 10 },
    { str: "12", transform: [1, 0, 0, 1, 134, 700], width: 8, height: 10 },
    { str: "224", transform: [1, 0, 0, 1, 148, 700], width: 14, height: 10 },
    { str: ",", transform: [1, 0, 0, 1, 162.5, 700], width: 3, height: 10 },
    { str: "91", transform: [1, 0, 0, 1, 166, 700], width: 8, height: 10 },
    { str: "18/09", transform: [1, 0, 0, 1, 12, 684], width: 20, height: 10 },
    { str: "EC", transform: [1, 0, 0, 1, 38, 684], width: 10, height: 10 },
    { str: "*LGELECTRON", transform: [1, 0, 0, 1, 52, 684], width: 64, height: 10 },
    { str: "07/12", transform: [1, 0, 0, 1, 122, 684], width: 20, height: 10 },
    { str: "410,67", transform: [1, 0, 0, 1, 148, 684], width: 24, height: 10 },
  ] as const;

  const lines = reconstructPdfLinesByPosition(items);
  assert.equal(lines.length >= 2, true);
  assert.equal(lines.some((line) => line.includes("04/09 Shopee*SHOPEE* 08/12 224,91")), true);
  assert.equal(lines.some((line) => line.includes("18/09 EC *LGELECTRON 07/12 410,67")), true);
});

test("import parser: texto reconstruído posicional do Itau gera compras reais", () => {
  const lines = [
    "Itaúcard",
    "Resumo da fatura em R$",
    "Vencimento 22/04/2026",
    "Lançamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "04/09 Shopee*SHOPEE* 08/12 224,91",
    "18/09 EC *LGELECTRON 07/12 410,67",
    "11/12 PG *WEBFONES W 05/06 108,16",
    "25/03 NETFLIX ENTRETENIMENTOB 59,90",
    "25/03 EBN *PLAYST 01/02 99,59",
    "02/04 EBN *PLAYST 01/04 21,62",
    "Total dos lançamentos atuais 0,00",
    "Compras parceladas - próximas faturas",
  ];

  const positionalItems: Array<{ str: string; transform: number[]; width: number; height: number }> = [];
  let y = 760;
  for (const line of lines) {
    let x = 10;
    for (const token of line.split(/\s+/)) {
      positionalItems.push({
        str: token,
        transform: [1, 0, 0, 1, x, y],
        width: Math.max(token.length * 4.6, 4),
        height: 10,
      });
      x += Math.max(token.length * 4.6, 4) + 2.2;
    }
    y -= 14;
  }

  const reconstructedText = reconstructPdfLinesByPosition(positionalItems).join("\n");
  const parsed = parsePdf(reconstructedText, [], "cartao-itau", {
    referenceBillingDate: "2026-04-22",
    issuerHint: "itau",
  });

  assert.equal(parsed.issuerDetected, "itau");
  assert.equal(parsed.items.length, 6);
  assert.equal(parsed.items.some((item) => item.descricao.toLowerCase().includes("shopee")), true);
  assert.equal(parsed.items.some((item) => item.descricao.toLowerCase().includes("netflix")), true);
  assert.equal(parsed.items.some((item) => item.valorParcela === 1910.79), false);
});

test("import parser: extrai texto de PDF textual valido", async () => {
  const minimalTextPdfBase64 =
    "JVBERi0xLjIKCjkgMCBvYmoKPDwKPj4Kc3RyZWFtCkJULyA5IFRmKFRlc3QpJyBFVAplbmRzdHJlYW0KZW5kb2JqCjQgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCA1IDAgUgovQ29udGVudHMgOSAwIFIKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL0tpZHNbNCAwIFIgXQovQ291bnQgMQovVHlwZSAvUGFnZXMKL01lZGlhQm94IFsgMCAwIDk5IDkgXQo+PgplbmRvYmoKMyAwIG9iago8PAovUGFnZXMgNSAwIFIKL1R5cGUgL0NhdGFsb2cKPj4KZW5kb2JqCnRyYWlsZXIKPDwKL1Jvb3QgMyAwIFIKPj4KJSVFT0Y=";
  const buffer = Buffer.from(minimalTextPdfBase64, "base64");
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const text = await extractTextFromPdfBuffer(arrayBuffer);
  assert.match(text.toLowerCase(), /test/);
});

function buildParsedImportItemFixture(overrides: Partial<ReturnType<typeof parseMercadoPagoInvoiceText>[number]> = {}) {
  return {
    id: overrides.id ?? "item-1",
    descricao: overrides.descricao ?? "Compra teste",
    estabelecimento: overrides.estabelecimento ?? "Compra teste",
    valor: overrides.valor ?? 1575.8,
    valorParcela: overrides.valorParcela ?? 157.58,
    parcelas: overrides.parcelas ?? 10,
    parcelaAtual: overrides.parcelaAtual ?? 5,
    parcelasRestantes: overrides.parcelasRestantes ?? 6,
    dataCompra: overrides.dataCompra ?? "2025-12-24",
    vencimentoFatura: overrides.vencimentoFatura ?? "2026-05-18",
    tipo: overrides.tipo ?? "compra",
    duplicata: overrides.duplicata ?? null,
    action: overrides.action ?? "import",
    cardLast4: (overrides as any).cardLast4 ?? null,
    invoiceIssuerDetected: (overrides as any).invoiceIssuerDetected,
    parserUsed: (overrides as any).parserUsed,
    ...overrides,
  };
}

function buildCompraCartaoFixture(overrides: Partial<CompraCartao> = {}): CompraCartao {
  return {
    id: overrides.id ?? "compra-1",
    userId: overrides.userId ?? "user-1",
    cartaoId: overrides.cartaoId ?? "cartao-mp",
    descricao: overrides.descricao ?? "PS Portal",
    valorTotal: overrides.valorTotal ?? "1575.00",
    parcelas: overrides.parcelas ?? 10,
    parcelaAtual: overrides.parcelaAtual ?? 5,
    valorParcela: overrides.valorParcela ?? "157.50",
    dataCompra: overrides.dataCompra ?? "2025-12-24",
    pessoaId: overrides.pessoaId ?? null,
    statusPessoa: overrides.statusPessoa ?? null,
    dataPagamentoPessoa: overrides.dataPagamentoPessoa ?? null,
  };
}

function buildCompraAliasSignalFixture(
  overrides: Partial<{
    id: string;
    compraCartaoId: string;
    cartaoId: string | null;
    nomeOriginal: string | null;
    nomeImportado: string;
    nomeNormalizado: string;
    issuer: string | null;
    parserUsed: string | null;
    cardLast4: string | null;
    valorParcela: string | null;
    totalParcelas: number | null;
    createdAt: string;
    updatedAt: string;
  }> = {},
) {
  return {
    id: overrides.id ?? "alias-1",
    compraCartaoId: overrides.compraCartaoId ?? "compra-1",
    cartaoId: overrides.cartaoId ?? "cartao-mp",
    nomeOriginal: overrides.nomeOriginal ?? "PS Portal",
    nomeImportado: overrides.nomeImportado ?? "MLP KaBuM KaBuM",
    nomeNormalizado: overrides.nomeNormalizado ?? "mlp kabum kabum",
    issuer: overrides.issuer ?? "mercado_pago",
    parserUsed: overrides.parserUsed ?? "mercado_pago_textual_pdf",
    cardLast4: overrides.cardLast4 ?? "9064",
    valorParcela: overrides.valorParcela ?? "157.58",
    totalParcelas: overrides.totalParcelas ?? 10,
    createdAt: overrides.createdAt ?? "2026-05-16T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-16T00:00:00.000Z",
  };
}

test("import parser: possível mesma compra detecta MLP KaBuM versus PS Portal com sinais financeiros próximos", () => {
  const item = buildParsedImportItemFixture({
    descricao: "MLP KaBuM KaBuM",
    valor: 1575.8,
    valorParcela: 157.58,
    parcelas: 10,
    parcelaAtual: 5,
    dataCompra: "2025-12-24",
  });
  const existing = buildCompraCartaoFixture({
    descricao: "PS Portal",
    valorTotal: "1575.00",
    valorParcela: "157.50",
    parcelas: 10,
    parcelaAtual: 5,
    dataCompra: "2025-12-24",
  });

  const match = findPossibleExistingPurchaseMatch(item, [existing], "cartao-mp");
  assert.ok(match);
  assert.equal(match?.existing.id, existing.id);
  assert.equal(match?.parcelasMatch, true);
  assert.equal(match?.valueDiff <= 1, true);
});

test("import parser: descrição diferente não impede match quando valor/parcela/data são próximos", () => {
  const item = buildParsedImportItemFixture({
    descricao: "MLP KaBuM KaBuM",
    valorParcela: 157.58,
    parcelas: 10,
    parcelaAtual: 5,
    dataCompra: "2025-12-24",
  });
  const existing = buildCompraCartaoFixture({
    descricao: "PS Portal",
    valorParcela: "157.50",
    valorTotal: "1575.00",
    parcelas: 10,
    parcelaAtual: 5,
    dataCompra: "2025-12-24",
  });

  const match = findPossibleExistingPurchaseMatch(item, [existing], "cartao-mp");
  assert.ok(match);
  assert.equal(match?.aliasMatched, false);
});

test("import parser: mesmo valor com parcelas incompatíveis não vira possível mesma compra forte", () => {
  const item = buildParsedImportItemFixture({
    valorParcela: 157.58,
    valor: 1575.8,
    parcelas: 10,
    parcelaAtual: 5,
  });
  const existing = buildCompraCartaoFixture({
    valorParcela: "157.58",
    valorTotal: "315.16",
    parcelas: 2,
    parcelaAtual: 2,
    dataCompra: "2025-12-24",
  });

  const match = findPossibleExistingPurchaseMatch(item, [existing], "cartao-mp");
  assert.equal(match, null);
});

test("import parser: compra claramente diferente não mostra possível mesma compra", () => {
  const item = buildParsedImportItemFixture({
    valorParcela: 89.9,
    valor: 89.9,
    parcelas: 1,
    parcelaAtual: 1,
    dataCompra: "2026-04-18",
  });
  const existing = buildCompraCartaoFixture({
    valorParcela: "157.50",
    valorTotal: "1575.00",
    parcelas: 10,
    parcelaAtual: 5,
    dataCompra: "2025-12-24",
  });

  const match = findPossibleExistingPurchaseMatch(item, [existing], "cartao-mp");
  assert.equal(match, null);
});

test("import parser: alias melhora confiança do match para possível mesma compra", () => {
  const item = buildParsedImportItemFixture({
    descricao: "MLP KaBuM KaBuM",
    valorParcela: 157.58,
    valor: 1575.8,
    parcelas: 10,
    parcelaAtual: 5,
    dataCompra: "2025-12-24",
    invoiceIssuerDetected: "mercado_pago",
    cardLast4: "9064",
  } as any);
  const existing = buildCompraCartaoFixture({
    id: "compra-ps-portal",
    descricao: "PS Portal",
    valorParcela: "157.50",
    valorTotal: "1575.00",
    parcelas: 10,
    parcelaAtual: 5,
    dataCompra: "2025-12-24",
  });
  const alias = buildCompraAliasSignalFixture({
    compraCartaoId: "compra-ps-portal",
    nomeImportado: "MLP KaBuM KaBuM",
    nomeNormalizado: "mlp kabum kabum",
  });

  const withoutAlias = findPossibleExistingPurchaseMatch(item as any, [existing], "cartao-mp");
  const withAlias = findPossibleExistingPurchaseMatch(item as any, [existing], "cartao-mp", [alias as any]);
  assert.ok(withoutAlias);
  assert.ok(withAlias);
  assert.equal(withAlias?.aliasMatched, true);
  assert.equal(withAlias?.aliasMatchedNameOriginal, "PS Portal");
  assert.equal((withAlias?.score ?? 0) > (withoutAlias?.score ?? 0), true);
});

test("import parser: alias não força match quando sinais financeiros são incompatíveis", () => {
  const item = buildParsedImportItemFixture({
    descricao: "MLP KaBuM KaBuM",
    valorParcela: 420,
    valor: 4200,
    parcelas: 10,
    parcelaAtual: 8,
    dataCompra: "2026-04-18",
    invoiceIssuerDetected: "mercado_pago",
  } as any);
  const existing = buildCompraCartaoFixture({
    id: "compra-ps-portal",
    descricao: "PS Portal",
    valorParcela: "157.50",
    valorTotal: "1575.00",
    parcelas: 10,
    parcelaAtual: 5,
    dataCompra: "2025-12-24",
  });
  const alias = buildCompraAliasSignalFixture({
    compraCartaoId: "compra-ps-portal",
    nomeImportado: "MLP KaBuM KaBuM",
    nomeNormalizado: "mlp kabum kabum",
  });

  const match = findPossibleExistingPurchaseMatch(item as any, [existing], "cartao-mp", [alias as any]);
  assert.equal(match, null);
});

test("import parser: issuer diferente no alias ainda ajuda, mas com confiança menor que issuer igual", () => {
  const item = buildParsedImportItemFixture({
    descricao: "NETFLIX.COM",
    valorParcela: 59.9,
    valor: 59.9,
    parcelas: 1,
    parcelaAtual: 1,
    dataCompra: "2026-03-25",
    invoiceIssuerDetected: "nubank",
  } as any);
  const existing = buildCompraCartaoFixture({
    id: "compra-netflix",
    descricao: "Netflix",
    cartaoId: "cartao-nu",
    valorParcela: "59.90",
    valorTotal: "59.90",
    parcelas: 1,
    parcelaAtual: 1,
    dataCompra: "2026-03-25",
  });
  const aliasSameIssuer = buildCompraAliasSignalFixture({
    compraCartaoId: "compra-netflix",
    cartaoId: "cartao-nu",
    nomeOriginal: "Netflix",
    nomeImportado: "NETFLIX.COM",
    nomeNormalizado: "netflix com",
    issuer: "nubank",
    valorParcela: "59.90",
    totalParcelas: 1,
  });
  const aliasDifferentIssuer = buildCompraAliasSignalFixture({
    ...aliasSameIssuer,
    id: "alias-2",
    issuer: "mercado_pago",
  });

  const sameIssuerMatch = findPossibleExistingPurchaseMatch(item as any, [existing], "cartao-nu", [aliasSameIssuer as any]);
  const differentIssuerMatch = findPossibleExistingPurchaseMatch(item as any, [existing], "cartao-nu", [aliasDifferentIssuer as any]);
  assert.ok(sameIssuerMatch);
  assert.ok(differentIssuerMatch);
  assert.equal(sameIssuerMatch?.aliasMatched, true);
  assert.equal(differentIssuerMatch?.aliasMatched, true);
  assert.equal((sameIssuerMatch?.score ?? 0) > (differentIssuerMatch?.score ?? 0), true);
});

test("import parser: buildCompraAliasDraft preserva sinais para issuer mercado_pago", () => {
  const item = buildParsedImportItemFixture({
    descricao: "MLP KaBuM KaBuM",
    valorParcela: 157.58,
    parcelas: 10,
    cardLast4: "9064",
    parserUsed: "mercado_pago_textual_pdf",
    invoiceIssuerDetected: "mercado_pago",
  } as any);
  const existing = buildCompraCartaoFixture({
    id: "compra-mp-1",
    cartaoId: "cartao-mp-1",
    descricao: "PS Portal",
  });

  const draft = buildCompraAliasDraft(item as any, existing);
  assert.equal(draft.compraCartaoId, "compra-mp-1");
  assert.equal(draft.cartaoId, "cartao-mp-1");
  assert.equal(draft.nomeOriginal, "PS Portal");
  assert.equal(draft.nomeImportado, "MLP KaBuM KaBuM");
  assert.equal(draft.issuer, "mercado_pago");
  assert.equal(draft.cardLast4, "9064");
  assert.equal(draft.totalParcelas, 10);
});

test("import parser: buildCompraAliasDraft funciona para issuer nubank e itau", () => {
  const existing = buildCompraCartaoFixture({
    id: "compra-issuer-1",
    cartaoId: "cartao-issuer-1",
    descricao: "Assinatura existente",
  });

  const nubankDraft = buildCompraAliasDraft(
    buildParsedImportItemFixture({
      descricao: "NETFLIX.COM",
      invoiceIssuerDetected: "nubank",
      parserUsed: "nubank_textual_pdf",
    } as any) as any,
    existing,
  );
  assert.equal(nubankDraft.issuer, "nubank");
  assert.equal(nubankDraft.parserUsed, "nubank_textual_pdf");

  const itauDraft = buildCompraAliasDraft(
    buildParsedImportItemFixture({
      descricao: "EBN PLAYSTATIONCURITIBABR",
      invoiceIssuerDetected: "itau",
      parserUsed: "itau_textual_pdf",
    } as any) as any,
    existing,
  );
  assert.equal(itauDraft.issuer, "itau");
  assert.equal(itauDraft.parserUsed, "itau_textual_pdf");
});

test("import parser: buildCompraAliasDraft usa issuer generic quando ausente e saneia cardLast4 inválido", () => {
  const item = buildParsedImportItemFixture({
    descricao: "Compra sem emissor",
    invoiceIssuerDetected: undefined,
    cardLast4: "90A4",
  } as any);
  const existing = buildCompraCartaoFixture({
    id: "compra-generic-1",
    cartaoId: "cartao-generic-1",
  });

  const draft = buildCompraAliasDraft(item as any, existing);
  assert.equal(draft.issuer, "generic");
  assert.equal(draft.cardLast4, null);
});

test("import parser: buildCreateCompraAliasRequestBody remove undefined e mantém campos numéricos", () => {
  const body = buildCreateCompraAliasRequestBody({
    compraCartaoId: "  compra-1  ",
    nomeImportado: "  MLP KaBuM KaBuM  ",
    cartaoId: null,
    nomeOriginal: "  PS Portal  ",
    issuer: "mercado_pago",
    parserUsed: "mercado_pago_textual_pdf",
    cardLast4: "9064",
    valorParcela: 157.58,
    totalParcelas: 10,
  });

  assert.equal(body.compraCartaoId, "compra-1");
  assert.equal(body.nomeImportado, "MLP KaBuM KaBuM");
  assert.equal(body.nomeOriginal, "PS Portal");
  assert.equal(body.issuer, "mercado_pago");
  assert.equal(body.cardLast4, "9064");
  assert.equal(body.valorParcela, 157.58);
  assert.equal(body.totalParcelas, 10);
  assert.equal(Object.hasOwn(body, "cartaoId"), false);
});

test("import parser: buildCreateCompraAliasRequestBody aceita cartaoId ausente e saneia opcionais inválidos", () => {
  const body = buildCreateCompraAliasRequestBody({
    compraCartaoId: "compra-2",
    nomeImportado: "NETFLIX.COM",
    cartaoId: "   ",
    issuer: "nubank",
    cardLast4: "90A4",
    valorParcela: Number.NaN,
    totalParcelas: 10.5,
  });

  assert.equal(body.compraCartaoId, "compra-2");
  assert.equal(body.nomeImportado, "NETFLIX.COM");
  assert.equal(body.issuer, "nubank");
  assert.equal(Object.hasOwn(body, "cartaoId"), false);
  assert.equal(Object.hasOwn(body, "cardLast4"), false);
  assert.equal(Object.hasOwn(body, "valorParcela"), false);
  assert.equal(Object.hasOwn(body, "totalParcelas"), false);
});

test("relatorios PDF: metadados usam overview quando disponível", () => {
  const metadata = buildRelatorioPdfMetadata({
    label: "Mês atual",
    dataSource: "overview",
    overviewPeriod: { startDate: "2026-04-01", endDate: "2026-04-30" },
    overviewGeneratedAt: "2026-05-14T03:10:00.000Z",
    fallbackStartDateIso: "2026-05-01",
    fallbackEndDateIso: "2026-05-31",
  });

  assert.equal(metadata.periodLabel.includes("01/04/2026"), true);
  assert.equal(metadata.periodLabel.includes("30/04/2026"), true);
  assert.equal(metadata.sourceLabel, "relatório consolidado");
  assert.equal(metadata.generatedAtLabel.length > 0, true);
});

test("relatorios PDF: metadados usam fallback em modo compatibilidade", () => {
  const metadata = buildRelatorioPdfMetadata({
    label: "Mês atual",
    dataSource: "legacy",
    overviewPeriod: null,
    overviewGeneratedAt: null,
    fallbackStartDateIso: "2026-05-01",
    fallbackEndDateIso: "2026-05-31",
    now: new Date("2026-05-14T12:34:00.000Z"),
  });

  assert.equal(metadata.periodLabel.includes("01/05/2026"), true);
  assert.equal(metadata.periodLabel.includes("31/05/2026"), true);
  assert.equal(metadata.sourceLabel, "modo compatibilidade");
  assert.equal(metadata.generatedAtLabel.length > 0, true);
});
