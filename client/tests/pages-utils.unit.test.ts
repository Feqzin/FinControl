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
import {
  getPessoaFilterFinancialTotals,
  matchesPessoaTipoFilter,
} from "../src/pages/pessoas/pessoas-filter.utils";
import { sortServicosForView } from "../src/pages/servicos/servicos-sort.utils";
import {
  buildServicoPeriodicidadeResumo,
  formatServicoBillingValue,
  resolveServicoBillingView,
} from "../src/pages/servicos/servico-periodicidade.utils";
import {
  decideLinkedCompraBillingValueFill,
  getCompraCartaoTotalForServico,
} from "../src/pages/servicos/servico-linked-compra.utils";
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
import type { Cartao, CompraCartao, Divida, Meta, Parcela, ParcelaCompra, Patrimonio, Pessoa, Renda, Servico } from "@shared/schema";
import {
  extractTextFromPdfBuffer,
  hasPdfMagicBytes,
  isExtractedPdfTextUsable,
  reconstructPdfLinesByPosition,
} from "../src/pages/cartoes/import-pdf-utils";
import { buildRelatorioPdfMetadata } from "../src/pages/relatorios/relatorios-pdf-utils";
import { formatMoneyFixed } from "../src/lib/money";
import { gerarHistoricoMensal } from "../src/utils/financialEngine";
import {
  getCompraReembolsoVisualStatus,
  isCompraReembolsoOutstanding,
} from "../src/lib/cartao-reembolso-status";
import {
  calculateCardLimitSummary,
  calculateCardInvoiceForCompetency,
  calculateCardCurrentInvoiceTotal,
  calculateCardUsedLimit,
  compraHasInstallmentInCompetency,
  compraHasOpenInstallmentInMonth,
  filterParcelasByCompetency,
  getNextOutstandingCardInvoiceSnapshot,
  getInvoiceCompetency,
  groupParcelasCompraByCompraId,
} from "../src/lib/card-limit-usage";
import { buildFinancialCalendarEvents } from "../src/lib/financial-calendar";
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
import { buildCreateCompraAliasRequestBody, buildUpdateCompraRequestBody } from "../src/services/api/cartoes";
import {
  buildEditCompraIconUpdatePatch,
  resolveEditCompraIconPresentation,
  resolvePersistableCompraIconId,
  resolveEditCompraIconRuleTarget,
} from "../src/pages/cartoes/edit-compra-icon.utils";
import {
  BUILTIN_ICON_PREFERENCE_RULE_ICON_ID,
  buildBuiltinIconDisablePreferenceTerm,
  matchIconByText,
  matchPurchaseIconByDescription,
} from "../src/lib/purchase-icon-matching";
import {
  resolveEntityDisplayIconId,
  resolveEntityIconIdForSave,
  resolveEntityIconReference,
  resolveEntityIconSuggestion,
} from "../src/lib/entity-icon-suggestion";
import { buildCompraReembolsoBreakdown } from "@shared/compra-reembolso";
import {
  formatInvoiceMonthLong,
  formatInvoiceMonthShort,
  getInvoiceMonthStatus,
  getVisibleInvoiceMonths,
  groupInvoiceMonthsByYear,
} from "../src/components/cartoes/invoice-month-selector.utils";
import { buildRelatoriosServicosMetrics } from "../src/pages/relatorios/relatorios-servicos-metrics.utils";
import { resolveDashboardServicosMetrics } from "../src/pages/dashboard/dashboard-servicos-metrics.utils";
import { calculateSimuladorBaseServicos } from "../src/pages/simulador/simulador-page-container";
import {
  buildFuturePurchaseSimulation,
  calculateSafePurchaseAmount,
  projectFuturePurchaseCashflow,
  type FuturePurchaseSimulationInput,
} from "../src/pages/simulador/future-purchase-simulation";
import {
  canAutoRematerializeCompetency,
  diffParcelasCompetencySchedules,
  matchesLegacyPurchaseDateSchedule,
  resolveDueDateFromCompetencia,
} from "@shared/parcelas-compra-competency";
import {
  calculateServicoEquivalentMonthlyAmount,
  calculateServicoMonthlyFinancialImpactAmount,
  calculateServicoRealMonthlyExpenseAmount,
  calculateServicoValorMensalEquivalente,
  calculateServicoRealChargeForCompetency,
  getServicoBillingDisplayInfo,
  isServicoLinkedToCardCharge,
  resolveServicoBillingFields,
} from "@shared/servico-periodicidade";
import { resolveServicoCategoryValue } from "@shared/service-categories";
import {
  ICON_CATEGORY_OPTIONS,
  ICON_CATEGORIES,
  getIconCategoryFilterValues,
  isVisibleIconCategory,
  matchesIconCategory,
  normalizeIconCategoryForDisplay,
  resolveIconCategoryValue,
} from "@shared/icon-categories";
import {
  buildIconKeywordsFromNameAndFilename,
  ICON_ALLOWED_MIME_TYPES,
  ICON_BATCH_UPLOAD_MAX_ITEMS,
  ICON_UPLOAD_MAX_BYTES,
  isIconMimeTypeAllowed,
  mergeBatchUploadKeywords,
  parseKeywordInput as parseBatchKeywordInput,
  suggestBatchIconNameFromFileName,
} from "../src/components/icon-picker-upload-batch.utils";
import type { UserIconLibraryItemApiModel } from "../src/services/api/user-icon-library";
import {
  filterAndSortPersonalIcons,
  paginateItems,
} from "../src/components/icon-picker-pagination.utils";
import {
  buildPackMatchSummaryByPackId,
  hasExploreSearchTerm,
  resolveExploreIconsForView,
  resolveExplorePacksForView,
} from "../src/components/icon-picker-explore-search.utils";

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
    iconeId: overrides.iconeId ?? null,
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
  const hasDataCobrancaOverride = Object.prototype.hasOwnProperty.call(overrides, "dataCobranca");
  return {
    id: overrides.id ?? "servico-1",
    userId: overrides.userId ?? "user-1",
    nome: overrides.nome ?? "Servico teste",
    categoria: overrides.categoria ?? "streaming",
    valorMensal: overrides.valorMensal ?? "19.90",
    periodicidadeCobranca: overrides.periodicidadeCobranca ?? null,
    valorCobranca: overrides.valorCobranca ?? null,
    dataCobranca: hasDataCobrancaOverride ? (overrides.dataCobranca ?? null) : 10,
    mesCobranca: overrides.mesCobranca ?? null,
    formaPagamento: overrides.formaPagamento ?? "cartao",
    compraCartaoId: overrides.compraCartaoId ?? null,
    status: overrides.status ?? "ativo",
    iconeId: overrides.iconeId ?? null,
  };
}

function withFakeNow<T>(isoDate: string, run: () => T): T {
  const RealDate = Date;
  const fixedTime = new RealDate(isoDate).getTime();

  class FakeDate extends RealDate {
    constructor(value?: string | number | Date) {
      if (arguments.length === 0) {
        super(fixedTime);
        return;
      }
      super(value as string | number | Date);
    }

    static now() {
      return fixedTime;
    }
  }

  // @ts-expect-error test-only Date override
  globalThis.Date = FakeDate;
  try {
    return run();
  } finally {
    globalThis.Date = RealDate;
  }
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

test("pessoas filtro: eu_devo considera dívidas onde usuário deve", () => {
  const resumo = {
    dividas: {
      comigo: { pendente: 0 },
      euDevo: { pendente: 94.38 },
    },
    comprasVinculadas: { pendentePessoa: 0 },
    servicosMesAtual: { pendente: 0 },
  };

  assert.equal(matchesPessoaTipoFilter("eu_devo", resumo), true);
  assert.equal(matchesPessoaTipoFilter("me_deve", resumo), false);
});

test("pessoas filtro: me_deve considera dívidas + compras + serviços pendentes", () => {
  const resumo = {
    dividas: {
      comigo: { pendente: 30 },
      euDevo: { pendente: 0 },
    },
    comprasVinculadas: { pendentePessoa: 20 },
    servicosMesAtual: { pendente: 10 },
  };

  const totais = getPessoaFilterFinancialTotals(resumo);
  assert.equal(totais.valorMeDevem, 60);
  assert.equal(totais.valorEuDevo, 0);
  assert.equal(matchesPessoaTipoFilter("me_deve", resumo), true);
  assert.equal(matchesPessoaTipoFilter("eu_devo", resumo), false);
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

test("servicos utils: serviços sem data fixa ficam no fim da ordenação por dia", () => {
  const servicos = [
    buildServicoFixture({ id: "s1", dataCobranca: 2, nome: "Dia 2" }),
    buildServicoFixture({ id: "s2", dataCobranca: null, nome: "Sem data" }),
    buildServicoFixture({ id: "s3", dataCobranca: 12, nome: "Dia 12" }),
  ];

  const porDiaMaisProximo = sortServicosForView(servicos, { sortBy: "dia_cobranca_mais_proximo", referenceDay: 10 });
  assert.deepEqual(porDiaMaisProximo.map((servico) => servico.id), ["s3", "s1", "s2"]);

  const porDiaMaisDistante = sortServicosForView(servicos, { sortBy: "dia_cobranca_mais_distante", referenceDay: 10 });
  assert.deepEqual(porDiaMaisDistante.map((servico) => servico.id), ["s1", "s3", "s2"]);
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

test("servicos categorias: normaliza cuidados pessoais", () => {
  assert.equal(resolveServicoCategoryValue("Cuidados pessoais"), "cuidados_pessoais");
  assert.equal(resolveServicoCategoryValue("cuidados-pessoais"), "cuidados_pessoais");
  assert.equal(resolveServicoCategoryValue("cuidados_pessoais"), "cuidados_pessoais");
});

test("servicos categorias: categoria invalida retorna null", () => {
  assert.equal(resolveServicoCategoryValue("categoria_invalida_xyz"), null);
});

test("servicos periodicidade: serviço legado sem periodicidade continua mensal", () => {
  const servicoLegado = buildServicoFixture({
    valorMensal: "49.90",
    periodicidadeCobranca: null,
    valorCobranca: null,
  });

  const billing = resolveServicoBillingView(servicoLegado);
  assert.equal(billing.periodicidade, "mensal");
  assert.equal(billing.valorCobranca, 49.9);
  assert.equal(billing.valorMensalEquivalente, 49.9);
  assert.equal(formatServicoBillingValue(servicoLegado), "R$\u00a049,90/mês");
});

test("servicos periodicidade: anual de R$ 229,82 gera equivalente mensal R$ 19,15", () => {
  const equivalente = calculateServicoValorMensalEquivalente("229.82", "anual");
  assert.equal(equivalente, 19.15);

  const resumo = buildServicoPeriodicidadeResumo("anual", "229.82");
  assert.equal(resumo.equivalenteMensal, 19.15);
  assert.equal(resumo.primary.includes("por ano"), true);
  assert.equal(resumo.secondary?.includes("R$\u00a019,15"), true);
});

test("servicos periodicidade: listagem anual mostra cobrança e equivalente mensal", () => {
  const servicoAnual = buildServicoFixture({
    periodicidadeCobranca: "anual",
    valorCobranca: "229.82",
    valorMensal: "19.15",
  });

  assert.equal(
    formatServicoBillingValue(servicoAnual),
    "R$\u00a0229,82/ano · equiv. R$\u00a019,15/mês",
  );
});

test("servicos periodicidade: trimestral calcula equivalente mensal corretamente", () => {
  const equivalente = calculateServicoValorMensalEquivalente("90.00", "trimestral");
  assert.equal(equivalente, 30);
});

test("servicos periodicidade canônica: equivalente mensal por periodicidade", () => {
  const mensal = calculateServicoEquivalentMonthlyAmount(buildServicoFixture({
    periodicidadeCobranca: "mensal",
    valorCobranca: "80.00",
    valorMensal: "80.00",
  }));
  assert.equal(mensal, 80);

  const anual = calculateServicoEquivalentMonthlyAmount(buildServicoFixture({
    periodicidadeCobranca: "anual",
    valorCobranca: "229.82",
    valorMensal: "19.15",
  }));
  assert.equal(anual, 19.15);

  const semestral = calculateServicoEquivalentMonthlyAmount(buildServicoFixture({
    periodicidadeCobranca: "semestral",
    valorCobranca: "120.00",
    valorMensal: "20.00",
  }));
  assert.equal(semestral, 20);

  const trimestral = calculateServicoEquivalentMonthlyAmount(buildServicoFixture({
    periodicidadeCobranca: "trimestral",
    valorCobranca: "90.00",
    valorMensal: "30.00",
  }));
  assert.equal(trimestral, 30);

  const bimestral = calculateServicoEquivalentMonthlyAmount(buildServicoFixture({
    periodicidadeCobranca: "bimestral",
    valorCobranca: "40.00",
    valorMensal: "20.00",
  }));
  assert.equal(bimestral, 20);
});

test("servicos periodicidade canônica: semanal usa aproximação mensal documentada", () => {
  const semanal = calculateServicoEquivalentMonthlyAmount(buildServicoFixture({
    periodicidadeCobranca: "semanal",
    valorCobranca: "70.00",
    valorMensal: "303.33",
  }));
  assert.equal(semanal, 303.33);
});

test("servicos periodicidade canônica: legado sem periodicidade mantém fallback mensal compatível", () => {
  const legado = calculateServicoEquivalentMonthlyAmount(buildServicoFixture({
    periodicidadeCobranca: null,
    valorCobranca: null,
    valorMensal: "49.90",
  }));
  assert.equal(legado, 49.9);
});

test("servicos periodicidade canônica: cobrança real anual e trimestral respeita competência base", () => {
  const anualServico = {
    ...buildServicoFixture({
      periodicidadeCobranca: "anual",
      valorCobranca: "229.82",
      valorMensal: "19.15",
      mesCobranca: 5,
    }),
  };
  assert.equal(calculateServicoRealChargeForCompetency(anualServico, "2026-05"), 229.82);
  assert.equal(calculateServicoRealChargeForCompetency(anualServico, "2026-06"), 0);
  assert.equal(calculateServicoRealChargeForCompetency(anualServico, "2027-05"), 229.82);

  const trimestralServico = {
    ...buildServicoFixture({
      periodicidadeCobranca: "trimestral",
      valorCobranca: "90.00",
      valorMensal: "30.00",
    }),
    competenciaBase: "2026-01",
  };
  assert.equal(calculateServicoRealChargeForCompetency(trimestralServico, "2026-01"), 90);
  assert.equal(calculateServicoRealChargeForCompetency(trimestralServico, "2026-02"), 0);
  assert.equal(calculateServicoRealChargeForCompetency(trimestralServico, "2026-04"), 90);
});

test("servicos periodicidade canônica: cobrança real semanal usa aproximação mensal por competência", () => {
  const semanalServico = buildServicoFixture({
    periodicidadeCobranca: "semanal",
    valorCobranca: "70.00",
    valorMensal: "303.33",
  });
  assert.equal(calculateServicoRealChargeForCompetency(semanalServico, "2026-05"), 303.33);
  assert.equal(calculateServicoRealChargeForCompetency(semanalServico, "2026-06"), 303.33);
});

test("servicos periodicidade canÃ´nica: anual sem mÃªs usa fallback seguro do mÃªs atual", () => {
  const semBase = buildServicoFixture({
    periodicidadeCobranca: "anual",
    valorCobranca: "120.00",
    valorMensal: "10.00",
  });
  const mesAtual = format(new Date(), "yyyy-MM");
  const mesSeguinte = format(addMonths(new Date(), 1), "yyyy-MM");
  assert.equal(calculateServicoRealChargeForCompetency(semBase, mesAtual), 120);
  assert.equal(calculateServicoRealChargeForCompetency(semBase, mesSeguinte), 0);
});

test("servicos periodicidade canônica: vínculo com cartão identifica risco de duplicidade", () => {
  const linked = buildServicoFixture({
    compraCartaoId: "compra-1",
  });
  assert.equal(isServicoLinkedToCardCharge(linked), true);
  assert.equal(isServicoLinkedToCardCharge(buildServicoFixture({ compraCartaoId: null })), false);
});

test("servicos periodicidade canônica: display info retorna texto curto com equivalente mensal", () => {
  const info = getServicoBillingDisplayInfo(buildServicoFixture({
    periodicidadeCobranca: "anual",
    valorCobranca: "229.82",
    valorMensal: "19.15",
  }));

  assert.equal(info.periodicidade, "anual");
  assert.equal(info.valorCobranca, 229.82);
  assert.equal(info.equivalenteMensal, 19.15);
  assert.equal(info.shortText.includes("equiv."), true);
});

test("servicos periodicidade canônica: valores inválidos/negativos não quebram e retornam zero", () => {
  const invalido = calculateServicoEquivalentMonthlyAmount({
    periodicidadeCobranca: "mensal",
    valorCobranca: "-100",
    valorMensal: "-100",
  });
  assert.equal(invalido, 0);

  const realCompetencia = calculateServicoRealChargeForCompetency({
    periodicidadeCobranca: "mensal",
    valorCobranca: "abc",
    valorMensal: "abc",
  }, "2026-05");
  assert.equal(realCompetencia, 0);
});

test("servicos periodicidade: payload legado com valorMensal resolve valorCobranca compatível", () => {
  const resolved = resolveServicoBillingFields({
    valorMensal: "59.90",
  });

  assert.equal(resolved.periodicidadeCobranca, "mensal");
  assert.equal(resolved.valorCobranca, "59.90");
  assert.equal(resolved.valorMensal, "59.90");
});

test("servicos periodicidade: payload novo mantém periodicidade e valor de cobrança", () => {
  const resolved = resolveServicoBillingFields({
    periodicidadeCobranca: "bimestral",
    valorCobranca: "40.00",
  });

  assert.equal(resolved.periodicidadeCobranca, "bimestral");
  assert.equal(resolved.valorCobranca, "40.00");
  assert.equal(resolved.valorMensal, "20.00");
});

test("servicos periodicidade: payload anual preserva mÃªs de cobranÃ§a", () => {
  const resolved = resolveServicoBillingFields({
    periodicidadeCobranca: "anual",
    valorCobranca: "99.90",
    mesCobranca: "6",
  });

  assert.equal(resolved.periodicidadeCobranca, "anual");
  assert.equal(resolved.valorCobranca, "99.90");
  assert.equal(resolved.valorMensal, "8.33");
  assert.equal(resolved.mesCobranca, 6);
});

test("servicos vínculo com compra: usa valor total da compra quando disponível", () => {
  const total = getCompraCartaoTotalForServico({
    valorTotal: "229.82",
    valorParcela: "229.82",
    parcelas: 1,
  });

  assert.equal(total, 229.82);
});

test("servicos vínculo com compra: fallback usa valorParcela * parcelas", () => {
  const total = getCompraCartaoTotalForServico({
    valorTotal: null,
    valorParcela: "100.00",
    parcelas: 10,
  });

  assert.equal(total, 1000);
});

test("servicos vínculo com compra: valor zerado preenche automaticamente com compra vinculada", () => {
  const decision = decideLinkedCompraBillingValueFill({
    currentValorCobranca: "0,00",
    periodicidadeCobranca: "anual",
    suggestedValorCobranca: 229.82,
  });

  assert.equal(decision.decision, "prefill");
  assert.equal(decision.suggestedValueInput, "229.82");
});

test("servicos vínculo com compra: valor manual diferente exige confirmação para sobrescrever", () => {
  const decision = decideLinkedCompraBillingValueFill({
    currentValorCobranca: "120.00",
    periodicidadeCobranca: "anual",
    suggestedValorCobranca: 229.82,
  });

  assert.equal(decision.decision, "confirm_overwrite");
  assert.equal(decision.suggestedValueInput, "229.82");
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

test("card limit usage: cartão sem compras retorna resumo zerado", () => {
  const summary = calculateCardLimitSummary("card-empty", [], new Map(), "2026-04", "900.00");

  assert.deepEqual(summary, {
    faturaAtual: 0,
    limiteComprometido: 0,
    limiteDisponivel: 900,
    saldoRestanteTotal: 0,
    quantidadeParcelasPendentes: 0,
  });
});

test("card limit usage: regra global calcula todos os cartões sem depender de banco ou nome", () => {
  const compras = [
    buildCompraCartaoViewFixture({
      id: "a-avista",
      cartaoId: "card-a",
      descricao: "Compra à vista",
      valorTotal: "200.00",
      valorParcela: "200.00",
      parcelas: 1,
      parcelaAtual: 1,
    }),
    buildCompraCartaoViewFixture({
      id: "a-parcelada",
      cartaoId: "card-a",
      descricao: "Compra parcelada",
      valorTotal: "200.00",
      valorParcela: "100.00",
      parcelas: 2,
      parcelaAtual: 1,
    }),
    buildCompraCartaoViewFixture({
      id: "a-reembolsada",
      cartaoId: "card-a",
      descricao: "Compra reembolsada",
      valorTotal: "50.00",
      valorParcela: "50.00",
      parcelas: 1,
      parcelaAtual: 1,
      pessoaId: "pessoa-1",
      statusPessoa: "pago",
      dataPagamentoPessoa: "2026-04-16",
    }),
    buildCompraCartaoViewFixture({
      id: "a-cancelada",
      cartaoId: "card-a",
      descricao: "Compra cancelada",
      valorTotal: "40.00",
      valorParcela: "40.00",
      parcelas: 1,
      parcelaAtual: 1,
    }),
    buildCompraCartaoViewFixture({
      id: "a-quitada",
      cartaoId: "card-a",
      descricao: "Compra quitada",
      valorTotal: "30.00",
      valorParcela: "30.00",
      parcelas: 1,
      parcelaAtual: 1,
    }),
    buildCompraCartaoViewFixture({
      id: "b-parcelada-1",
      cartaoId: "card-b",
      descricao: "Compra parcelada 1",
      valorTotal: "120.00",
      valorParcela: "60.00",
      parcelas: 2,
      parcelaAtual: 1,
    }),
    buildCompraCartaoViewFixture({
      id: "b-parcelada-2",
      cartaoId: "card-b",
      descricao: "Compra parcelada 2",
      valorTotal: "80.00",
      valorParcela: "80.00",
      parcelas: 1,
      parcelaAtual: 1,
    }),
  ];
  const parcelas = [
    buildParcelaCompraViewFixture({
      id: "a-avista-abr",
      compraCartaoId: "a-avista",
      numero: 1,
      valor: "200.00",
      dataVencimento: "2026-04-05",
      statusCartao: "pendente",
    }),
    buildParcelaCompraViewFixture({
      id: "a-parcelada-abr",
      compraCartaoId: "a-parcelada",
      numero: 1,
      valor: "100.00",
      dataVencimento: "2026-04-10",
      statusCartao: "pendente",
    }),
    buildParcelaCompraViewFixture({
      id: "a-parcelada-mai",
      compraCartaoId: "a-parcelada",
      numero: 2,
      valor: "100.00",
      dataVencimento: "2026-05-10",
      statusCartao: "pendente",
    }),
    buildParcelaCompraViewFixture({
      id: "a-reembolsada-abr",
      compraCartaoId: "a-reembolsada",
      numero: 1,
      valor: "50.00",
      dataVencimento: "2026-04-15",
      statusCartao: "pendente",
      statusPessoa: "pago",
      dataPagamentoPessoa: "2026-04-16",
    }),
    buildParcelaCompraViewFixture({
      id: "a-cancelada-abr",
      compraCartaoId: "a-cancelada",
      numero: 1,
      valor: "40.00",
      dataVencimento: "2026-04-18",
      statusCartao: "cancelado",
    }),
    buildParcelaCompraViewFixture({
      id: "a-quitada-abr",
      compraCartaoId: "a-quitada",
      numero: 1,
      valor: "30.00",
      dataVencimento: "2026-04-20",
      statusCartao: "pago",
      dataPagamentoCartao: "2026-04-20",
    }),
    buildParcelaCompraViewFixture({
      id: "b-parcelada-1-abr",
      compraCartaoId: "b-parcelada-1",
      numero: 1,
      valor: "60.00",
      dataVencimento: "2026-04-08",
      statusCartao: "pendente",
    }),
    buildParcelaCompraViewFixture({
      id: "b-parcelada-1-mai",
      compraCartaoId: "b-parcelada-1",
      numero: 2,
      valor: "60.00",
      dataVencimento: "2026-05-08",
      statusCartao: "pendente",
    }),
    buildParcelaCompraViewFixture({
      id: "b-parcelada-2-abr",
      compraCartaoId: "b-parcelada-2",
      numero: 1,
      valor: "80.00",
      dataVencimento: "2026-04-22",
      statusCartao: "pendente",
    }),
  ];
  const grouped = groupParcelasCompraByCompraId(parcelas);

  const summaryCardA = calculateCardLimitSummary("card-a", compras, grouped, "2026-04", "1000.00");
  const summaryCardB = calculateCardLimitSummary("card-b", compras, grouped, "2026-04", "500.00");

  assert.deepEqual(summaryCardA, {
    faturaAtual: 350,
    limiteComprometido: 450,
    limiteDisponivel: 550,
    saldoRestanteTotal: 450,
    quantidadeParcelasPendentes: 4,
  });
  assert.deepEqual(summaryCardB, {
    faturaAtual: 140,
    limiteComprometido: 200,
    limiteDisponivel: 300,
    saldoRestanteTotal: 200,
    quantidadeParcelasPendentes: 3,
  });

  assert.equal(calculateCardCurrentInvoiceTotal("card-a", compras, grouped, "2026-04"), 350);
  assert.equal(calculateCardCurrentInvoiceTotal("card-b", compras, grouped, "2026-04"), 140);
  assert.equal(calculateCardInvoiceForCompetency("card-a", compras, grouped, "2026-05"), 100);
  assert.equal(calculateCardInvoiceForCompetency("card-b", compras, grouped, "2026-05"), 60);
  assert.equal(calculateCardUsedLimit("card-a", compras, grouped), 450);
  assert.equal(calculateCardUsedLimit("card-b", compras, grouped), 200);
});

test("card limit usage: próxima fatura futura não infla a fatura atual do mesmo mês", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "mercado-pago-julho",
    cartaoId: "mercado-pago-visa",
    descricao: "Mercado Pago Visa",
    valorTotal: "1087.00",
    valorParcela: "1087.00",
    parcelas: 1,
    parcelaAtual: 1,
    dataCompra: "2026-06-20",
  });
  const grouped = groupParcelasCompraByCompraId([
    buildParcelaCompraViewFixture({
      id: "mercado-pago-julho-1",
      compraCartaoId: compra.id,
      numero: 1,
      valor: "1087.00",
      dataVencimento: "2026-07-15",
      statusCartao: "pendente",
    }),
  ]);

  assert.equal(
    calculateCardInvoiceForCompetency("mercado-pago-visa", [compra], grouped, "2026-06"),
    0,
  );
  assert.deepEqual(
    getNextOutstandingCardInvoiceSnapshot("mercado-pago-visa", [compra], grouped, 15),
    {
      monthReference: "2026-07",
      dueDate: "2026-07-15",
      total: 1087,
      installmentCount: 1,
    },
  );
});

test("card limit usage: parcelas pagas ou canceladas não geram próxima fatura em aberto", () => {
  const compraPaga = buildCompraCartaoViewFixture({
    id: "mercado-pago-paga",
    cartaoId: "mercado-pago-visa",
    valorTotal: "500.00",
    valorParcela: "500.00",
    parcelas: 1,
    parcelaAtual: 1,
  });
  const compraCancelada = buildCompraCartaoViewFixture({
    id: "mercado-pago-cancelada",
    cartaoId: "mercado-pago-visa",
    valorTotal: "587.00",
    valorParcela: "587.00",
    parcelas: 1,
    parcelaAtual: 1,
  });
  const grouped = groupParcelasCompraByCompraId([
    buildParcelaCompraViewFixture({
      id: "mercado-pago-paga-1",
      compraCartaoId: compraPaga.id,
      numero: 1,
      valor: "500.00",
      dataVencimento: "2026-07-15",
      statusCartao: "pago",
      dataPagamentoCartao: "2026-07-15",
    }),
    buildParcelaCompraViewFixture({
      id: "mercado-pago-cancelada-1",
      compraCartaoId: compraCancelada.id,
      numero: 1,
      valor: "587.00",
      dataVencimento: "2026-07-15",
      statusCartao: "cancelado",
    }),
  ]);

  assert.equal(
    calculateCardInvoiceForCompetency("mercado-pago-visa", [compraPaga, compraCancelada], grouped, "2026-07"),
    0,
  );
  assert.equal(
    getNextOutstandingCardInvoiceSnapshot("mercado-pago-visa", [compraPaga, compraCancelada], grouped, 15),
    null,
  );
});

test("cartoes reembolso status: parcela paga no cartao com reembolso pendente continua aguardando reembolso", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "compra-reembolso-pendente",
    pessoaId: "pessoa-1",
    statusPessoa: "pago",
    parcelas: 7,
    parcelaAtual: 7,
    valorTotal: "793.31",
    valorParcela: "113.33",
  });
  const parcelas = [
    buildParcelaCompraViewFixture({
      id: "pc-1",
      compraCartaoId: compra.id,
      numero: 1,
      statusCartao: "pago",
      statusPessoa: "pago",
      dataPagamentoPessoa: "2026-01-12",
    }),
    buildParcelaCompraViewFixture({
      id: "pc-7",
      compraCartaoId: compra.id,
      numero: 7,
      statusCartao: "pago",
      statusPessoa: "pendente",
      dataVencimento: "2030-07-10",
    }),
  ];

  const status = getCompraReembolsoVisualStatus(compra, parcelas, "2030-07-01");

  assert.equal(status, "aguardando_reembolso");
  assert.equal(isCompraReembolsoOutstanding(status), true);
});

test("cartoes reembolso status: compra com parcelas parcialmente reembolsadas nao aparece como reembolsada", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "compra-reembolso-parcial",
    pessoaId: "pessoa-1",
    statusPessoa: "pago",
    parcelas: 7,
    parcelaAtual: 7,
    valorTotal: "793.31",
    valorParcela: "113.33",
  });
  const parcelas = Array.from({ length: 7 }, (_, index) => buildParcelaCompraViewFixture({
    id: `pc-parcial-${index + 1}`,
    compraCartaoId: compra.id,
    numero: index + 1,
    statusCartao: "pago",
    statusPessoa: index < 6 ? "pago" : "pendente",
    dataVencimento: "2030-07-10",
  }));

  assert.equal(getCompraReembolsoVisualStatus(compra, parcelas, "2030-07-01"), "aguardando_reembolso");
});

test("cartoes reembolso status: compra com todas as parcelas reembolsadas aparece como reembolsada", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "compra-reembolso-total",
    pessoaId: "pessoa-1",
    statusPessoa: "pendente",
    parcelas: 3,
    parcelaAtual: 3,
    valorTotal: "300.00",
    valorParcela: "100.00",
  });
  const parcelas = Array.from({ length: 3 }, (_, index) => buildParcelaCompraViewFixture({
    id: `pc-total-${index + 1}`,
    compraCartaoId: compra.id,
    numero: index + 1,
    statusCartao: "pago",
    statusPessoa: "pago",
    dataPagamentoPessoa: `2030-0${index + 1}-12`,
  }));

  assert.equal(getCompraReembolsoVisualStatus(compra, parcelas, "2030-07-01"), "reembolsado");
});

test("cartoes reembolso status: parcela pendente vencida aparece como reembolso vencido", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "compra-reembolso-vencido",
    pessoaId: "pessoa-1",
    statusPessoa: "pendente",
    parcelas: 2,
    parcelaAtual: 2,
    valorTotal: "200.00",
    valorParcela: "100.00",
  });
  const parcelas = [
    buildParcelaCompraViewFixture({
      id: "pc-v-1",
      compraCartaoId: compra.id,
      numero: 1,
      statusCartao: "pago",
      statusPessoa: "pago",
      dataPagamentoPessoa: "2030-01-11",
    }),
    buildParcelaCompraViewFixture({
      id: "pc-v-2",
      compraCartaoId: compra.id,
      numero: 2,
      statusCartao: "pago",
      statusPessoa: "pendente",
      dataVencimento: "2030-02-10",
    }),
  ];

  assert.equal(getCompraReembolsoVisualStatus(compra, parcelas, "2030-02-20"), "reembolso_vencido");
});

test("cartoes reembolso status: compra sem pessoa vinculada nao exibe status de reembolso", () => {
  const compra = buildCompraCartaoViewFixture({
    id: "compra-sem-pessoa",
    pessoaId: "",
  });

  assert.equal(getCompraReembolsoVisualStatus(compra, [], "2030-07-01"), "sem_reembolso_vinculado");
  assert.equal(isCompraReembolsoOutstanding("sem_reembolso_vinculado"), false);
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
    iconeId: overrides.iconeId ?? null,
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

test("cartões API: buildUpdateCompraRequestBody saneia iconeId e remove undefined", () => {
  const body = buildUpdateCompraRequestBody({
    descricao: "Ifood Club",
    valorTotal: "422,79",
    parcelas: "1",
    pessoaId: "",
    statusPessoa: "pendente",
    iconeId: "  https://cdn.exemplo/icon-ifood.png  ",
    reembolsoModo: null,
    reembolsoValorTotal: undefined,
    reembolsoPercentual: undefined,
  });

  assert.equal(body.descricao, "Ifood Club");
  assert.equal(body.valorTotal, "422.79");
  assert.equal(body.parcelas, 1);
  assert.equal(body.pessoaId, null);
  assert.equal(body.iconeId, "https://cdn.exemplo/icon-ifood.png");
  assert.equal(Object.hasOwn(body, "reembolsoValorTotal"), true);
  assert.equal(Object.hasOwn(body, "reembolsoPercentual"), true);
});

test("cartões API: buildUpdateCompraRequestBody converte iconeId vazio para null e omite quando undefined", () => {
  const withEmptyIcon = buildUpdateCompraRequestBody({
    descricao: "Netflix",
    valorTotal: "59,90",
    parcelas: "1",
    pessoaId: "",
    statusPessoa: "pendente",
    iconeId: "   ",
    reembolsoModo: null,
  });
  assert.equal(withEmptyIcon.iconeId, null);

  const withoutIconOverride = buildUpdateCompraRequestBody({
    descricao: "Spotify",
    valorTotal: "21,90",
    parcelas: "1",
    pessoaId: "",
    statusPessoa: "pendente",
    reembolsoModo: null,
  });
  assert.equal(Object.hasOwn(withoutIconOverride, "iconeId"), false);
});

test("editar compra ícone: compra sem icone manual + sugestão automática não envia iconeId no patch", () => {
  const patch = buildEditCompraIconUpdatePatch({
    iconDirty: false,
    editedIconId: null,
  });

  assert.equal(Object.hasOwn(patch, "iconeId"), false);
});

test("editar compra ícone: separar manual persistido de sugestão automática no preview", () => {
  const suggested = resolveEditCompraIconPresentation({
    persistedIconId: null,
    editedIconId: null,
    iconDirty: false,
    autoSuggestedIconId: "data:image/png;base64,club-ifood",
  });
  assert.equal(suggested.source, "suggested");
  assert.equal(suggested.previewIconId, "data:image/png;base64,club-ifood");
  assert.equal(suggested.manualIconId, null);

  const manual = resolveEditCompraIconPresentation({
    persistedIconId: "ifood",
    editedIconId: null,
    iconDirty: false,
    autoSuggestedIconId: "data:image/png;base64,club-ifood",
  });
  assert.equal(manual.source, "manual");
  assert.equal(manual.previewIconId, "ifood");
  assert.equal(manual.manualIconId, "ifood");
});

test("editar compra ícone: escolher ícone manual marca patch com iconeId e limpar envia null", () => {
  const selectedPatch = buildEditCompraIconUpdatePatch({
    iconDirty: true,
    editedIconId: "data:image/png;base64,club-ifood",
  });
  assert.equal(selectedPatch.iconeId, "data:image/png;base64,club-ifood");

  const clearedPatch = buildEditCompraIconUpdatePatch({
    iconDirty: true,
    editedIconId: null,
  });
  assert.equal(clearedPatch.iconeId, null);
});

test("editar compra ícone: regra para compras parecidas usa somente ícone manual válido", () => {
  const fromPersisted = resolveEditCompraIconRuleTarget({
    applyRule: true,
    iconDirty: false,
    editedIconId: null,
    persistedIconId: "ifood",
  });
  assert.equal(fromPersisted, "ifood");

  const fromChanged = resolveEditCompraIconRuleTarget({
    applyRule: true,
    iconDirty: true,
    editedIconId: "data:image/png;base64,club-ifood",
    persistedIconId: null,
  });
  assert.equal(fromChanged, "data:image/png;base64,club-ifood");

  const fromAutoOnly = resolveEditCompraIconRuleTarget({
    applyRule: true,
    iconDirty: false,
    editedIconId: null,
    persistedIconId: null,
  });
  assert.equal(fromAutoOnly, null);
});

test("editar compra ícone: resolve icone persistível para ícone padrão sem alterar valor", () => {
  const resolved = resolvePersistableCompraIconId({
    iconDirty: true,
    editedDisplayIconId: "nubank",
    explicitPersistableIconId: undefined,
    userIcons: [],
  });

  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.value, "nubank");
});

test("editar compra ícone: converte imageUrl pessoal para user_icon_library.id antes do PATCH", () => {
  const resolved = resolvePersistableCompraIconId({
    iconDirty: true,
    editedDisplayIconId: "https://cdn.fincontrol.dev/icons/club-ifood.png",
    explicitPersistableIconId: undefined,
    userIcons: [{ id: "user-icon-1", imageUrl: "https://cdn.fincontrol.dev/icons/club-ifood.png" }],
  });

  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.value, "user-icon-1");
});

test("editar compra ícone: bloqueia referência remota sem vínculo persistível", () => {
  const resolved = resolvePersistableCompraIconId({
    iconDirty: true,
    editedDisplayIconId: "data:image/png;base64,abc123",
    explicitPersistableIconId: undefined,
    userIcons: [],
  });

  assert.equal(resolved.ok, false);
  if (resolved.ok) return;
  assert.equal(resolved.reason, "ICON_REFERENCE_INVALID");
});

test("entity icon suggestion: Novo Cartão aplica ícone por palavra-chave forte com referência persistível", () => {
  const suggestion = resolveEntityIconSuggestion({
    name: "C6 Bank",
    userRules: [
      {
        id: "rule-c6",
        iconId: "https://cdn.fincontrol.dev/icons/c6.png",
        normalizedTerm: "c6 bank",
        originalTerm: "c6 bank",
      },
    ],
    userIcons: [
      {
        id: "user-icon-c6",
        userId: "user-1",
        sourceType: "upload",
        officialIconId: null,
        name: "C6 Bank",
        imageUrl: "https://cdn.fincontrol.dev/icons/c6.png",
        storagePath: null,
        category: "banco",
        tags: ["c6", "c6 bank"],
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    ],
  });

  assert.equal(suggestion.shouldAutoApply, true);
  assert.equal(suggestion.displayIconId, "https://cdn.fincontrol.dev/icons/c6.png");
  assert.equal(suggestion.persistableIconId, "user-icon-c6");
});

test("entity icon suggestion: Novo Cartão com Nubank usa chave estável da biblioteca padrão", () => {
  const suggestion = resolveEntityIconSuggestion({
    name: "Nubank Ultravioleta",
    userRules: [],
    userIcons: [],
  });

  assert.equal(suggestion.shouldAutoApply, true);
  assert.equal(suggestion.displayIconId, "nubank");
  assert.equal(suggestion.persistableIconId, "nubank");
});

test("entity icon suggestion: Novo Serviço com Netflix aplica automaticamente ícone padrão", () => {
  const suggestion = resolveEntityIconSuggestion({
    name: "Netflix Assinatura",
    userRules: [],
    userIcons: [],
  });

  assert.equal(suggestion.shouldAutoApply, true);
  assert.equal(suggestion.displayIconId, "netflix");
  assert.equal(suggestion.persistableIconId, "netflix");
});

test("entity icon suggestion: match médio sugere sem autoaplicar", () => {
  const suggestion = resolveEntityIconSuggestion({
    name: "cartao bank c6 platinum",
    userRules: [
      {
        id: "rule-c6-medium",
        iconId: "https://cdn.fincontrol.dev/icons/c6.png",
        normalizedTerm: "c6 bank",
        originalTerm: "c6 bank",
      },
    ],
    userIcons: [
      {
        id: "user-icon-c6",
        userId: "user-1",
        sourceType: "upload",
        officialIconId: null,
        name: "C6 Bank",
        imageUrl: "https://cdn.fincontrol.dev/icons/c6.png",
        storagePath: null,
        category: "banco",
        tags: ["c6", "c6 bank"],
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    ],
  });

  assert.equal(suggestion.shouldAutoApply, false);
  assert.equal(suggestion.shouldSuggest, true);
  assert.equal(suggestion.persistableIconId, "user-icon-c6");
});

test("entity icon suggestion: ícone manual não deve ser sobrescrito no save", () => {
  const autoSuggestion = resolveEntityIconSuggestion({
    name: "Nubank Ultravioleta",
    userRules: [],
    userIcons: [],
  });
  const savedIconId = resolveEntityIconIdForSave({
    isManualSelection: true,
    manualPersistableIconId: "user-icon-manual",
    autoSuggestion,
  });

  assert.equal(savedIconId, "user-icon-manual");
});

test("entity icon suggestion: limpar ícone manual permite voltar para auto matching", () => {
  const autoSuggestion = resolveEntityIconSuggestion({
    name: "Nubank Ultravioleta",
    userRules: [],
    userIcons: [],
  });
  const savedIconId = resolveEntityIconIdForSave({
    isManualSelection: false,
    manualPersistableIconId: null,
    autoSuggestion,
  });

  assert.equal(savedIconId, "nubank");
});

test("entity icon reference: referência remota sem vínculo não vira iconeId persistível", () => {
  const resolved = resolveEntityIconReference("data:image/png;base64,abc123", []);
  assert.equal(resolved.displayIconId, "data:image/png;base64,abc123");
  assert.equal(resolved.persistableIconId, null);
});

test("icon matching: Netflix reconhece Netflix com match forte", () => {
  const result = matchPurchaseIconByDescription("Netflix.comsaopaulobr", []);
  assert.equal(result.matched, true);
  assert.equal(result.iconId, "netflix");
  assert.equal(result.shouldAutoApply, true);
});

test("icon matching: Spotify reconhece Spotify com match forte", () => {
  const result = matchPurchaseIconByDescription("DM SPOTIFY Premium", []);
  assert.equal(result.matched, true);
  assert.equal(result.iconId, "spotify");
  assert.equal(result.shouldAutoApply, true);
});

test("icon matching: KaBuM reconhece MLP KaBuM com regra pessoal", () => {
  const result = matchPurchaseIconByDescription("MLP KaBuM KaBuM", [
    {
      id: "rule-1",
      iconId: "kabum",
      originalTerm: "mlp kabum",
      normalizedTerm: "mlp kabum",
    },
  ]);
  assert.equal(result.matched, true);
  assert.equal(result.iconId, "kabum");
  assert.equal(result.source, "personal_rule");
  assert.equal(result.shouldAutoApply, true);
});

test("icon matching: alias de ícone oficial adicionado reconhece compra por regra pessoal do usuário", () => {
  const officialIconDataUrl = "data:image/png;base64,official-kabum";
  const result = matchPurchaseIconByDescription("MLP KaBuM KaBuM", [
    {
      id: "rule-official-1",
      iconId: officialIconDataUrl,
      originalTerm: "mlp kabum",
      normalizedTerm: "mlp kabum",
    },
  ]);
  assert.equal(result.matched, true);
  assert.equal(result.iconId, officialIconDataUrl);
  assert.equal(result.source, "personal_rule");
});

test("icon matching: match fraco não aplica automático", () => {
  const result = matchPurchaseIconByDescription("Mercearia do bairro central", []);
  assert.equal(result.shouldAutoApply, false);
  assert.equal(result.shouldSuggest, false);
});

test("icon matching: compra importada recebe ícone quando match forte", () => {
  const importedPurchaseDescription = "NETFLIX ENTRETENIMENTO";
  const result = matchPurchaseIconByDescription(importedPurchaseDescription, []);
  assert.equal(result.iconId, "netflix");
  assert.equal(result.shouldAutoApply, true);
});

test("icon matching: desativação por usuário impede autoaplicação do ícone padrão", () => {
  const result = matchPurchaseIconByDescription("Netflix.comsaopaulobr", [
    {
      id: "pref-disable-netflix",
      iconId: BUILTIN_ICON_PREFERENCE_RULE_ICON_ID,
      originalTerm: buildBuiltinIconDisablePreferenceTerm("netflix"),
      normalizedTerm: "builtin icon disabled netflix",
    },
  ]);

  assert.equal(result.iconId, null);
  assert.equal(result.shouldAutoApply, false);
});

test("icon matching: regra pessoal para ícone padrão desativado também é bloqueada", () => {
  const result = matchIconByText("Mercado Pago", [
    {
      id: "pref-disable-mercado-pago",
      iconId: BUILTIN_ICON_PREFERENCE_RULE_ICON_ID,
      originalTerm: buildBuiltinIconDisablePreferenceTerm("mercadopago"),
      normalizedTerm: "builtin icon disabled mercado pago",
    },
    {
      id: "rule-mercado-pago",
      iconId: "mercadopago",
      originalTerm: "mercado pago",
      normalizedTerm: "mercado pago",
    },
  ]);

  assert.equal(result.iconId, null);
  assert.equal(result.shouldAutoApply, false);
});

test("icon matching: desativação do padrão não bloqueia regra pessoal forte", () => {
  const personalIconId = "data:image/svg+xml;base64,custom-netflix";
  const result = matchPurchaseIconByDescription("Netflix.comsaopaulobr", [
    {
      id: "pref-disable-netflix",
      iconId: BUILTIN_ICON_PREFERENCE_RULE_ICON_ID,
      originalTerm: buildBuiltinIconDisablePreferenceTerm("netflix"),
      normalizedTerm: "builtin icon disabled netflix",
    },
    {
      id: "rule-personal-netflix",
      iconId: personalIconId,
      originalTerm: "netflix",
      normalizedTerm: "netflix",
    },
  ]);

  assert.equal(result.iconId, personalIconId);
  assert.equal(result.source, "personal_rule");
  assert.equal(result.shouldAutoApply, true);
});

test("entity icon suggestion: ícone oficial inativo na biblioteca não pode ser sugerido automaticamente", () => {
  const suggestion = resolveEntityIconSuggestion({
    name: "Mercado Pago",
    userRules: [
      {
        id: "rule-user-mercado-pago",
        iconId: "https://cdn.fincontrol.dev/icons/mercado-pago.png",
        normalizedTerm: "mercado pago",
        originalTerm: "mercado pago",
      },
    ],
    userIcons: [
      {
        id: "user-icon-mercado-pago",
        userId: "user-1",
        sourceType: "official",
        officialIconId: "official-mercado-pago",
        isActive: false,
        name: "Mercado Pago",
        imageUrl: "https://cdn.fincontrol.dev/icons/mercado-pago.png",
        storagePath: null,
        category: "banco",
        tags: ["mercado pago"],
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    ],
  });

  assert.equal(suggestion.displayIconId, null);
  assert.equal(suggestion.persistableIconId, null);
  assert.equal(suggestion.shouldAutoApply, false);
  assert.equal(suggestion.shouldSuggest, false);
});

test("entity icon suggestion: ícone pessoal ativo com keyword exata entra no auto match", () => {
  const suggestion = resolveEntityIconSuggestion({
    name: "Mercado Pago",
    userRules: [
      {
        id: "rule-user-mercado-pago",
        iconId: "https://cdn.fincontrol.dev/icons/mercado-pago-personal.png",
        normalizedTerm: "mercado pago",
        originalTerm: "Mercado Pago",
      },
    ],
    userIcons: [
      {
        id: "user-icon-mercado-pago",
        userId: "user-1",
        sourceType: "upload",
        officialIconId: null,
        isActive: true,
        name: "Mercado Pago Pessoal",
        imageUrl: "https://cdn.fincontrol.dev/icons/mercado-pago-personal.png",
        storagePath: null,
        category: "banco",
        tags: ["mercado pago"],
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    ],
  });

  assert.equal(suggestion.displayIconId, "https://cdn.fincontrol.dev/icons/mercado-pago-personal.png");
  assert.equal(suggestion.persistableIconId, "user-icon-mercado-pago");
  assert.equal(suggestion.shouldAutoApply, true);
  assert.equal(suggestion.match.source, "personal_rule");
});

test("entity icon suggestion: ícone pessoal inativo com keyword exata não entra no auto match", () => {
  const suggestion = resolveEntityIconSuggestion({
    name: "Mercado Pago",
    userRules: [
      {
        id: "rule-user-mercado-pago",
        iconId: "https://cdn.fincontrol.dev/icons/mercado-pago-personal.png",
        normalizedTerm: "mercado pago",
        originalTerm: "Mercado Pago",
      },
    ],
    userIcons: [
      {
        id: "user-icon-mercado-pago",
        userId: "user-1",
        sourceType: "upload",
        officialIconId: null,
        isActive: false,
        name: "Mercado Pago Pessoal",
        imageUrl: "https://cdn.fincontrol.dev/icons/mercado-pago-personal.png",
        storagePath: null,
        category: "banco",
        tags: ["mercado pago"],
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    ],
  });

  assert.equal(suggestion.displayIconId, "mercadopago");
  assert.equal(suggestion.persistableIconId, "mercadopago");
  assert.equal(suggestion.shouldAutoApply, true);
  assert.equal(suggestion.match.source, "builtin_keyword");
});

test("entity icon suggestion: ícone pessoal ativo tem prioridade sobre builtin", () => {
  const suggestion = resolveEntityIconSuggestion({
    name: "Mercado Pago",
    userRules: [
      {
        id: "rule-user-mercado-pago",
        iconId: "https://cdn.fincontrol.dev/icons/mercado-pago-personal.png",
        normalizedTerm: "mercado pago",
        originalTerm: "Mercado Pago",
      },
    ],
    userIcons: [
      {
        id: "user-icon-mercado-pago",
        userId: "user-1",
        sourceType: "upload",
        officialIconId: null,
        isActive: true,
        name: "Mercado Pago Pessoal",
        imageUrl: "https://cdn.fincontrol.dev/icons/mercado-pago-personal.png",
        storagePath: null,
        category: "banco",
        tags: ["mercado pago"],
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    ],
  });

  assert.equal(suggestion.displayIconId, "https://cdn.fincontrol.dev/icons/mercado-pago-personal.png");
  assert.equal(suggestion.persistableIconId, "user-icon-mercado-pago");
  assert.notEqual(suggestion.displayIconId, "mercadopago");
  assert.equal(suggestion.match.source, "personal_rule");
});

test("entity icon display: patrimônio com ícone padrão desativado usa fallback seguro", () => {
  const displayIconId = resolveEntityDisplayIconId({
    explicitIconId: null,
    name: "Mercado Pago",
    userRules: [
      {
        id: "pref-disable-mercado-pago",
        iconId: BUILTIN_ICON_PREFERENCE_RULE_ICON_ID,
        originalTerm: buildBuiltinIconDisablePreferenceTerm("mercadopago"),
        normalizedTerm: "builtin icon disabled mercado pago",
      },
    ],
    userIcons: [],
  });

  assert.equal(displayIconId, null);
});

test("icon matching: ícone pessoal reconhece cartão Itaú Uniclass Visa", () => {
  const result = matchIconByText("Itaú Uniclass Visa", [
    {
      id: "rule-itau-1",
      iconId: "data:image/svg+xml;base64,itau-icon",
      originalTerm: "itau",
      normalizedTerm: "itau",
    },
    {
      id: "rule-itau-2",
      iconId: "data:image/svg+xml;base64,itau-icon",
      originalTerm: "itaucard",
      normalizedTerm: "itaucard",
    },
  ]);

  assert.equal(result.matched, true);
  assert.equal(result.iconId, "data:image/svg+xml;base64,itau-icon");
  assert.equal(result.source, "personal_rule");
  assert.equal(result.shouldAutoApply, true);
});

test("icon matching: ícone pessoal reconhece compra com itaucard/itaú", () => {
  const result = matchIconByText("PG *ITAUCARD supermercado", [
    {
      id: "rule-itau-3",
      iconId: "data:image/svg+xml;base64,itau-icon",
      originalTerm: "itaucard",
      normalizedTerm: "itaucard",
    },
  ]);

  assert.equal(result.matched, true);
  assert.equal(result.iconId, "data:image/svg+xml;base64,itau-icon");
  assert.equal(result.shouldSuggest, true);
});

test("icon categories: lista visível final bate exatamente com o catálogo aprovado", () => {
  const values = ICON_CATEGORY_OPTIONS.map((category) => category.value);
  assert.deepEqual(values, [
    "banco",
    "servico",
    "loja",
    "mercado",
    "delivery",
    "farmacia",
    "transporte",
    "game",
    "streaming",
    "saude",
    "imposto",
    "seguro",
    "internet",
    "energia",
    "viagem",
    "alimentacao",
    "casa",
    "pet",
    "outro",
  ]);
  assert.deepEqual(ICON_CATEGORIES.map((category) => category.value), values);
});

test("icon categories: compatibilidade com categorias legadas mantém filtros funcionais", () => {
  assert.equal(resolveIconCategoryValue("marketplaces"), "loja");
  assert.equal(resolveIconCategoryValue("supermercados"), "mercado");
  assert.equal(resolveIconCategoryValue("games"), "game");
  assert.equal(resolveIconCategoryValue("carteira"), "banco");
  assert.equal(resolveIconCategoryValue("assinatura"), "servico");
  assert.equal(resolveIconCategoryValue("educacao"), "servico");
  assert.equal(resolveIconCategoryValue("telefonia"), "internet");

  const lojaFilterValues = getIconCategoryFilterValues("loja");
  assert.equal(lojaFilterValues.includes("loja"), true);
  assert.equal(lojaFilterValues.includes("marketplaces"), true);

  const bancoFilterValues = getIconCategoryFilterValues("banco");
  assert.equal(bancoFilterValues.includes("carteira"), true);

  assert.equal(matchesIconCategory("marketplaces", "loja"), true);
  assert.equal(matchesIconCategory("supermercados", "mercado"), true);
  assert.equal(matchesIconCategory("carteira", "banco"), true);
  assert.equal(matchesIconCategory("telefonia", "internet"), true);
  assert.equal(matchesIconCategory("categoria-desconhecida", "loja"), false);
  assert.equal(matchesIconCategory("categoria-desconhecida", "all"), true);
});

test("icon categories: categorias removidas não são visíveis e são normalizadas para exibição", () => {
  assert.equal(isVisibleIconCategory("carteira"), false);
  assert.equal(isVisibleIconCategory("assinatura"), false);
  assert.equal(isVisibleIconCategory("educacao"), false);
  assert.equal(isVisibleIconCategory("telefonia"), false);
  assert.equal(isVisibleIconCategory("banco"), true);
  assert.equal(isVisibleIconCategory("servico"), true);
  assert.equal(isVisibleIconCategory("internet"), true);

  assert.equal(normalizeIconCategoryForDisplay("carteira"), "banco");
  assert.equal(normalizeIconCategoryForDisplay("carteiras"), "banco");
  assert.equal(normalizeIconCategoryForDisplay("assinatura"), "servico");
  assert.equal(normalizeIconCategoryForDisplay("educacao"), "servico");
  assert.equal(normalizeIconCategoryForDisplay("telefonia"), "internet");
});

test("icon picker pagination utils: filtra, ordena e busca em Meus ícones", () => {
  const icons: UserIconLibraryItemApiModel[] = [
    {
      id: "icon-1",
      userId: "user-1",
      sourceType: "upload",
      officialIconId: null,
      name: "Itaú Unibanco",
      imageUrl: "https://cdn.fincontrol.dev/itau.png",
      storagePath: null,
      category: "banco",
      tags: ["itau", "itaucard"],
      createdAt: "2026-05-12T10:00:00.000Z",
      updatedAt: "2026-05-12T10:00:00.000Z",
    },
    {
      id: "icon-2",
      userId: "user-1",
      sourceType: "upload",
      officialIconId: null,
      name: "Netflix",
      imageUrl: "https://cdn.fincontrol.dev/netflix.png",
      storagePath: null,
      category: "streaming",
      tags: ["filme", "serie"],
      createdAt: "2026-05-10T10:00:00.000Z",
      updatedAt: "2026-05-10T10:00:00.000Z",
    },
    {
      id: "icon-3",
      userId: "user-1",
      sourceType: "upload",
      officialIconId: null,
      name: "Mercado Pago",
      imageUrl: "https://cdn.fincontrol.dev/mp.png",
      storagePath: null,
      category: "servico",
      tags: ["mp", "carteira digital"],
      createdAt: "2026-05-11T10:00:00.000Z",
      updatedAt: "2026-05-11T10:00:00.000Z",
    },
  ];

  const onlyBanks = filterAndSortPersonalIcons(icons, {
    search: "",
    category: "banco",
    sort: "recent",
  });
  assert.deepEqual(onlyBanks.map((item) => item.id), ["icon-1"]);

  const searchStreaming = filterAndSortPersonalIcons(icons, {
    search: "streaming",
    category: "all",
    sort: "name-asc",
  });
  assert.deepEqual(searchStreaming.map((item) => item.id), ["icon-2"]);

  const sortedByName = filterAndSortPersonalIcons(icons, {
    search: "",
    category: "all",
    sort: "name-asc",
  });
  assert.deepEqual(sortedByName.map((item) => item.id), ["icon-1", "icon-3", "icon-2"]);
});

test("icon picker pagination utils: pagina coleção e limita em janela estável", () => {
  const values = Array.from({ length: 41 }, (_, index) => `icon-${index + 1}`);
  const page1 = paginateItems(values, 1, 40);
  assert.equal(page1.items.length, 40);
  assert.equal(page1.startIndex, 0);
  assert.equal(page1.endIndex, 40);
  assert.equal(page1.totalItems, 41);
  assert.equal(page1.totalPages, 2);

  const page2 = paginateItems(values, 2, 40);
  assert.deepEqual(page2.items, ["icon-41"]);
  assert.equal(page2.startIndex, 40);
  assert.equal(page2.endIndex, 41);
  assert.equal(page2.page, 2);
});

test("icon picker explore search: sem busca mantém ícones individuais de packs visíveis na seção individual", () => {
  const icons = [
    {
      id: "icon-individual",
      iconKey: "official-netflix",
      sourceType: "official",
      sourceUserIconId: null,
      ownerUserId: null,
      ownerLabel: null,
      ownerPublicCode: null,
      name: "Netflix",
      imageUrl: "https://cdn/icons/netflix.png",
      storagePath: null,
      category: "streaming",
      tags: ["netflix"],
      aliases: [],
      packId: null,
      packName: null,
      hiddenBecausePacked: false,
      representedInPack: false,
      alreadyInLibrary: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    {
      id: "icon-pack-itau",
      iconKey: "community:bank:itau",
      sourceType: "community",
      sourceUserIconId: "user-icon-itau",
      ownerUserId: null,
      ownerLabel: "Fernando",
      ownerPublicCode: "USR-AAAA1111",
      name: "Itaú Unibanco",
      imageUrl: "https://cdn/icons/itau.png",
      storagePath: null,
      category: "banco",
      tags: ["itau", "itaucard"],
      aliases: [],
      packId: "pack-bancos",
      packName: "Bancos",
      hiddenBecausePacked: false,
      representedInPack: false,
      alreadyInLibrary: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
  ];

  const visibleIcons = resolveExploreIconsForView(icons as any, {
    search: "",
    category: "all",
  });

  assert.deepEqual(visibleIcons.map((icon) => icon.id), ["icon-individual", "icon-pack-itau"]);
});

test("icon picker explore search: com busca mostra ícones de pack e encontra pack por ícone interno", () => {
  const icons = [
    {
      id: "icon-pack-itau",
      iconKey: "community:bank:itau",
      sourceType: "community",
      sourceUserIconId: "user-icon-itau",
      ownerUserId: null,
      ownerLabel: "Fernando",
      ownerPublicCode: "USR-AAAA1111",
      name: "Itaú Unibanco",
      imageUrl: "https://cdn/icons/itau.png",
      storagePath: null,
      category: "banco",
      tags: ["itau", "itaucard"],
      aliases: [],
      packId: "pack-bancos",
      packName: "Bancos",
      hiddenBecausePacked: false,
      representedInPack: false,
      alreadyInLibrary: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
  ];
  const packs = [
    {
      id: "pack-bancos",
      name: "Bancos",
      description: "Pack com bancos brasileiros",
      category: "banco",
      coverImageUrl: null,
      sourceType: "community",
      ownerUserId: null,
      ownerLabel: "Fernando",
      ownerPublicCode: "USR-AAAA1111",
      isPublished: true,
      iconsCount: 5,
      addedIconsCount: 0,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
  ];

  const matchedIcons = resolveExploreIconsForView(icons as any, {
    search: "itau",
    category: "all",
  });
  assert.deepEqual(matchedIcons.map((icon) => icon.id), ["icon-pack-itau"]);

  const matchesByPack = buildPackMatchSummaryByPackId(matchedIcons as any);
  assert.equal(matchesByPack.has("pack-bancos"), true);

  const matchedPacks = resolveExplorePacksForView(packs as any, {
    search: "itau",
    matchingPackIds: new Set(matchesByPack.keys()),
  });
  assert.deepEqual(matchedPacks.map((pack) => pack.id), ["pack-bancos"]);
});

test("icon picker explore search: categoria e termo funcionam juntos na busca interna de packs", () => {
  const icons = [
    {
      id: "icon-pack-itau",
      iconKey: "community:bank:itau",
      sourceType: "community",
      sourceUserIconId: "user-icon-itau",
      ownerUserId: null,
      ownerLabel: "Fernando",
      ownerPublicCode: "USR-AAAA1111",
      name: "Itaú Unibanco",
      imageUrl: "https://cdn/icons/itau.png",
      storagePath: null,
      category: "banco",
      tags: ["itau", "itaucard"],
      aliases: [],
      packId: "pack-bancos",
      packName: "Bancos",
      hiddenBecausePacked: false,
      representedInPack: false,
      alreadyInLibrary: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    {
      id: "icon-pack-cinema",
      iconKey: "community:movie:cinemark",
      sourceType: "community",
      sourceUserIconId: "user-icon-cinema",
      ownerUserId: null,
      ownerLabel: "Fernando",
      ownerPublicCode: "USR-AAAA1111",
      name: "Cinemark",
      imageUrl: "https://cdn/icons/cinemark.png",
      storagePath: null,
      category: "servico",
      tags: ["cinema"],
      aliases: [],
      packId: "pack-lazer",
      packName: "Lazer",
      hiddenBecausePacked: false,
      representedInPack: false,
      alreadyInLibrary: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
  ];

  const matchedBankIcons = resolveExploreIconsForView(icons as any, {
    search: "itau",
    category: "banco",
  });

  assert.deepEqual(matchedBankIcons.map((icon) => icon.id), ["icon-pack-itau"]);
  assert.equal(hasExploreSearchTerm("itau"), true);
  assert.equal(hasExploreSearchTerm("   "), false);
});

test("icon picker explore search: com busca mantém item de pack visível por metadado de origem", () => {
  const icons = [
    {
      id: "icon-pack-next",
      iconKey: "community:bank:next",
      sourceType: "community",
      sourceUserIconId: "user-icon-next",
      ownerUserId: null,
      ownerLabel: "Fernando",
      ownerPublicCode: "USR-AAAA1111",
      name: "Next Bank",
      imageUrl: "https://cdn/icons/next.png",
      storagePath: null,
      category: "banco",
      tags: ["next"],
      aliases: [],
      packId: null,
      packName: "Bancos",
      packPublicCode: "USR-AAAA1111-P001",
      hiddenBecausePacked: false,
      representedInPack: false,
      alreadyInLibrary: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
  ];

  const matchedWithSearch = resolveExploreIconsForView(icons as any, {
    search: "next",
    category: "all",
  });
  assert.deepEqual(matchedWithSearch.map((icon) => icon.id), ["icon-pack-next"]);

  const matchedWithoutSearch = resolveExploreIconsForView(icons as any, {
    search: "",
    category: "all",
  });
  assert.deepEqual(matchedWithoutSearch.map((icon) => icon.id), ["icon-pack-next"]);
});

test("icon picker explore search: com busca evita duplicata individual representada em pack", () => {
  const icons = [
    {
      id: "icon-pack-itau",
      iconKey: "community:bank:itau:pack",
      sourceType: "community",
      sourceUserIconId: "user-icon-itau",
      ownerUserId: null,
      ownerLabel: "Fernando",
      ownerPublicCode: "USR-AAAA1111",
      name: "Itaú Unibanco",
      imageUrl: "https://cdn/icons/itau.png",
      storagePath: null,
      category: "banco",
      tags: ["itau", "itaucard"],
      aliases: [],
      packId: "pack-bancos",
      packName: "Bancos",
      hiddenBecausePacked: false,
      representedInPack: false,
      alreadyInLibrary: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    {
      id: "icon-individual-legado-itau",
      iconKey: "community:bank:itau",
      sourceType: "community",
      sourceUserIconId: "user-icon-itau",
      ownerUserId: null,
      ownerLabel: "Fernando",
      ownerPublicCode: "USR-AAAA1111",
      name: "Itaú Unibanco",
      imageUrl: "https://cdn/icons/itau.png",
      storagePath: null,
      category: "banco",
      tags: ["itau"],
      aliases: [],
      packId: null,
      packName: null,
      hiddenBecausePacked: true,
      representedInPack: true,
      alreadyInLibrary: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
  ];

  const matched = resolveExploreIconsForView(icons as any, {
    search: "itau",
    category: "all",
  });

  assert.deepEqual(matched.map((icon) => icon.id), ["icon-pack-itau"]);
});

test("icon picker explore search: com busca prioriza item de pack mesmo sem flags de representado", () => {
  const icons = [
    {
      id: "icon-pack-itau",
      iconKey: "community:user_a:user-icon-itau:pack:pack-bancos",
      sourceType: "community",
      sourceUserIconId: "user-icon-itau",
      ownerUserId: null,
      ownerLabel: "@fernandoq87",
      ownerPublicCode: "USR-AAAA1111",
      name: "Itaú Unibanco",
      imageUrl: "https://cdn/icons/itau.png",
      storagePath: null,
      category: "banco",
      tags: ["itau", "itaucard"],
      aliases: [],
      packId: "pack-bancos",
      packName: "Bancos",
      packItemPublicCode: "USR-AAAA1111-P001-I001",
      hiddenBecausePacked: false,
      representedInPack: false,
      alreadyInLibrary: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    {
      id: "icon-individual-itau",
      iconKey: "community:user_a:user-icon-itau",
      sourceType: "community",
      sourceUserIconId: "user-icon-itau",
      ownerUserId: null,
      ownerLabel: "@fernandoq87",
      ownerPublicCode: "USR-AAAA1111",
      name: "Itaú Unibanco",
      imageUrl: "https://cdn/icons/itau.png",
      storagePath: null,
      category: "banco",
      tags: ["itau"],
      aliases: [],
      packId: null,
      packName: null,
      hiddenBecausePacked: false,
      representedInPack: false,
      alreadyInLibrary: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
  ];

  const matched = resolveExploreIconsForView(icons as any, {
    search: "itau",
    category: "all",
  });

  assert.deepEqual(matched.map((icon) => icon.id), ["icon-pack-itau"]);
});

test("icon picker explore search: com busca prioriza item de pack mesmo com individual equivalente por nome/categoria", () => {
  const icons = [
    {
      id: "icon-pack-itau-main",
      iconKey: "community:user_a:user-icon-itau-1:pack:pack-bancos",
      sourceType: "community",
      sourceUserIconId: "user-icon-itau-1",
      ownerUserId: null,
      ownerLabel: "@fernandoq87",
      ownerPublicCode: "USR-AAAA1111",
      name: "Itaú Unibanco",
      imageUrl: "https://cdn.example.com/itau/main.png",
      storagePath: null,
      category: "banco",
      tags: ["itau", "banco"],
      aliases: [],
      packId: "pack-bancos",
      packName: "Bancos",
      packPublicCode: "USR-AAAA1111-P001",
      packItemPublicCode: "USR-AAAA1111-P001-I001",
      hiddenBecausePacked: false,
      representedInPack: false,
      alreadyInLibrary: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    {
      id: "icon-individual-itau-legacy",
      iconKey: "community:user_a:user-icon-itau-legacy",
      sourceType: "community",
      sourceUserIconId: "user-icon-itau-legacy",
      ownerUserId: null,
      ownerLabel: "@fernandoq87",
      ownerPublicCode: "USR-AAAA1111",
      name: "Itaú Unibanco",
      imageUrl: "https://cdn.example.com/itau/legacy.png?cache=1",
      storagePath: null,
      category: "banco",
      tags: ["itau"],
      aliases: [],
      packId: null,
      packName: null,
      hiddenBecausePacked: false,
      representedInPack: false,
      alreadyInLibrary: false,
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    },
  ];

  const matched = resolveExploreIconsForView(icons as any, {
    search: "itau",
    category: "all",
  });

  assert.deepEqual(matched.map((icon) => icon.id), ["icon-pack-itau-main"]);
});

test("icon picker explore search: mantém ícones de packs diferentes e individual sem equivalente", () => {
  const icons = [
    {
      id: "icon-pack-itau-a",
      iconKey: "community:user_a:user-icon-itau-a:pack:pack-bancos-br",
      sourceType: "community",
      sourceUserIconId: "user-icon-itau-a",
      ownerUserId: null,
      ownerLabel: "@fernandoq87",
      ownerPublicCode: "USR-AAAA1111",
      name: "Itaú Unibanco",
      imageUrl: "https://cdn/icons/itau-a.png",
      storagePath: null,
      category: "banco",
      tags: ["itau"],
      aliases: [],
      packId: "pack-bancos-br",
      packName: "Bancos BR",
      packItemPublicCode: "USR-AAAA1111-P001-I001",
      hiddenBecausePacked: false,
      representedInPack: false,
      alreadyInLibrary: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    {
      id: "icon-pack-itau-b",
      iconKey: "community:user_b:user-icon-itau-b:pack:pack-bancos-premium",
      sourceType: "community",
      sourceUserIconId: "user-icon-itau-b",
      ownerUserId: null,
      ownerLabel: "@outrousuario",
      ownerPublicCode: "USR-BBBB2222",
      name: "Itaú Unibanco",
      imageUrl: "https://cdn/icons/itau-b.png",
      storagePath: null,
      category: "banco",
      tags: ["itau"],
      aliases: [],
      packId: "pack-bancos-premium",
      packName: "Bancos Premium",
      packItemPublicCode: "USR-BBBB2222-P003-I004",
      hiddenBecausePacked: false,
      representedInPack: false,
      alreadyInLibrary: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    {
      id: "icon-individual-outro",
      iconKey: "community:user_c:user-icon-outro",
      sourceType: "community",
      sourceUserIconId: "user-icon-outro",
      ownerUserId: null,
      ownerLabel: "@usuario3",
      ownerPublicCode: "USR-CCCC3333",
      name: "Itaucard Seguros",
      imageUrl: "https://cdn/icons/itau-seguros.png",
      storagePath: null,
      category: "seguro",
      tags: ["itau", "seguro"],
      aliases: [],
      packId: null,
      packName: null,
      hiddenBecausePacked: false,
      representedInPack: false,
      alreadyInLibrary: false,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
  ];

  const matched = resolveExploreIconsForView(icons as any, {
    search: "itau",
    category: "all",
  });

  assert.deepEqual(matched.map((icon) => icon.id), [
    "icon-pack-itau-a",
    "icon-pack-itau-b",
    "icon-individual-outro",
  ]);
});

test("icon batch upload utils: sugere nome amigável a partir do arquivo", () => {
  assert.equal(suggestBatchIconNameFromFileName("Itau_Unibanco_logo_2023.svg"), "Itau Unibanco Logo");
  assert.equal(suggestBatchIconNameFromFileName("kabum-icone.png"), "Kabum Icone");
});

test("icon batch upload utils: LinkedIn_145807.png não gera keyword numérica pura", () => {
  const keywords = buildIconKeywordsFromNameAndFilename({
    name: "LinkedIn",
    originalFileName: "LinkedIn_145807.png",
  });
  assert.equal(keywords.includes("LinkedIn"), true);
  assert.equal(keywords.includes("145807"), false);
});

test("icon batch upload utils: Itau_Unibanco_logo_2023.svg remove token técnico e ano", () => {
  const keywords = buildIconKeywordsFromNameAndFilename({
    name: "Itau Unibanco",
    originalFileName: "Itau_Unibanco_logo_2023.svg",
  });
  assert.equal(keywords.includes("Itau"), true);
  assert.equal(keywords.includes("Unibanco"), true);
  assert.equal(keywords.some((entry) => entry.toLowerCase() === "logo"), false);
  assert.equal(keywords.includes("2023"), false);
});

test("icon batch upload utils: C6_Bank_logo.png preserva marca com número útil", () => {
  const keywords = buildIconKeywordsFromNameAndFilename({
    name: "C6 Bank",
    originalFileName: "C6_Bank_logo.png",
  });
  assert.equal(keywords.includes("C6"), true);
  assert.equal(keywords.includes("Bank"), true);
  assert.equal(keywords.includes("C6 Bank"), true);
});

test("icon batch upload utils: 99pay_icon_1080.png mantém 99pay e remove 1080", () => {
  const keywords = buildIconKeywordsFromNameAndFilename({
    name: "99pay",
    originalFileName: "99pay_icon_1080.png",
  });
  assert.equal(keywords.includes("99pay"), true);
  assert.equal(keywords.includes("1080"), false);
});

test("icon batch upload utils: merge de palavras-chave herda base, item, nome e arquivo sem lixo", () => {
  const merged = mergeBatchUploadKeywords({
    defaultKeywords: ["kabum", "mercado livre"],
    itemKeywords: "kabum, games",
    iconName: "KaBuM",
    originalFileName: "MLP_KaBuM_logo_2024.svg",
  });

  assert.equal(merged.includes("kabum"), true);
  assert.equal(merged.includes("mercado livre"), true);
  assert.equal(merged.includes("games"), true);
  assert.equal(merged.some((entry) => entry.includes("logo")), false);
  assert.equal(merged.includes("2024"), false);
});

test("icon batch upload utils: mantém palavras-base do usuário e deduplica termos úteis", () => {
  const merged = mergeBatchUploadKeywords({
    defaultKeywords: "LinkedIn, linkedin",
    itemKeywords: "linkedin, vagas",
    iconName: "LinkedIn",
    originalFileName: "LinkedIn_145807_logo.png",
  });

  assert.equal(merged.includes("LinkedIn"), true);
  assert.equal(merged.includes("vagas"), true);
  assert.equal(merged.includes("145807"), false);
  assert.equal(merged.filter((entry) => entry.toLowerCase() === "linkedin").length, 1);
});

test("icon batch upload utils: parse keywords remove duplicadas e espaços extras", () => {
  const parsed = parseBatchKeywordInput("  itau, itaú, itaucard, ITAUCARD , unibanco  ");
  assert.deepEqual(parsed, ["itau", "itaucard", "unibanco"]);
});

test("icon batch upload utils: valida tipos permitidos e limites padrão", () => {
  assert.equal(isIconMimeTypeAllowed("image/png"), true);
  assert.equal(isIconMimeTypeAllowed("image/jpeg"), true);
  assert.equal(isIconMimeTypeAllowed("image/webp"), false);
  assert.equal(ICON_ALLOWED_MIME_TYPES.includes("image/svg+xml"), true);
  assert.equal(ICON_UPLOAD_MAX_BYTES, 512 * 1024);
  assert.equal(ICON_BATCH_UPLOAD_MAX_ITEMS, 30);
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

test("dashboard serviços: usa métricas detalhadas quando disponíveis", () => {
  const metrics = resolveDashboardServicosMetrics({
    totalServicos: 120,
    servicosEquivalenteMensalTotal: 139.15,
    servicosCobrancaRealCompetenciaTotal: 319.82,
    servicosVinculadosCartaoEquivalenteMensalTotal: 19.15,
    servicosVinculadosCartaoCobrancaRealTotal: 229.82,
    servicosNaoVinculadosCartaoEquivalenteMensalTotal: 120,
    servicosNaoVinculadosCartaoCobrancaRealTotal: 90,
  });

  assert.equal(metrics.hasDetailedMetrics, true);
  assert.equal(metrics.totalLegacy, 120);
  assert.equal(metrics.realMonthlyTotal, 90);
  assert.equal(metrics.equivalenteMensalTotal, 139.15);
  assert.equal(metrics.cobrancaRealCompetenciaTotal, 319.82);
  assert.equal(metrics.vinculadosCartaoEquivalenteMensalTotal, 19.15);
  assert.equal(metrics.vinculadosCartaoCobrancaRealTotal, 229.82);
  assert.equal(metrics.naoVinculadosCartaoEquivalenteMensalTotal, 120);
  assert.equal(metrics.naoVinculadosCartaoCobrancaRealTotal, 90);
});

test("dashboard serviços: fallback compatível quando campos novos estão ausentes", () => {
  const metrics = resolveDashboardServicosMetrics({
    totalServicos: 80,
  });

  assert.equal(metrics.hasDetailedMetrics, false);
  assert.equal(metrics.totalLegacy, 80);
  assert.equal(metrics.realMonthlyTotal, 80);
  assert.equal(metrics.equivalenteMensalTotal, 80);
  assert.equal(metrics.cobrancaRealCompetenciaTotal, 80);
  assert.equal(metrics.vinculadosCartaoEquivalenteMensalTotal, 0);
  assert.equal(metrics.vinculadosCartaoCobrancaRealTotal, 0);
  assert.equal(metrics.naoVinculadosCartaoEquivalenteMensalTotal, 80);
  assert.equal(metrics.naoVinculadosCartaoCobrancaRealTotal, 80);
});

test("relatórios serviços: separa média mensal e cobrança real no período para anual/trimestral", () => {
  const activeServicos = [
    {
      ...buildServicoFixture({
        id: "s-anual",
        nome: "Distrokid",
        periodicidadeCobranca: "anual",
        valorCobranca: "229.82",
        valorMensal: "19.15",
        compraCartaoId: "compra-1",
      }),
      competenciaBase: "2026-05",
    } as Servico,
    {
      ...buildServicoFixture({
        id: "s-tri",
        nome: "Ferramenta X",
        periodicidadeCobranca: "trimestral",
        valorCobranca: "90.00",
        valorMensal: "30.00",
        compraCartaoId: null,
      }),
      competenciaBase: "2026-04",
    } as Servico,
  ];

  const metrics = buildRelatoriosServicosMetrics({
    activeServicos,
    overviewSummary: null,
    startDateIso: "2026-05-01",
    endDateIso: "2026-05-31",
  });

  assert.equal(metrics.monthlyAverageTotal, 49.15);
  assert.equal(metrics.realChargeInPeriodTotal, 229.82);
  assert.equal(metrics.linkedCardRealChargeInPeriodTotal, 229.82);
  assert.equal(metrics.nonLinkedCardRealChargeInPeriodTotal, 0);
});

test("relatórios serviços: usa cobrança real do summary quando métricas detalhadas ainda não existem", () => {
  const activeServicos = [
    buildServicoFixture({
      id: "s-mensal",
      nome: "Netflix",
      periodicidadeCobranca: null,
      valorCobranca: null,
      valorMensal: "50.00",
    }),
  ];

  const metrics = buildRelatoriosServicosMetrics({
    activeServicos,
    overviewSummary: {
      incomeTotal: 0,
      expenseTotal: 0,
      balance: 0,
      patrimonioTotal: 0,
      dividasAPagar: 0,
      valoresAReceber: 0,
      gastosFixos: 50,
      servicosAtivosTotal: 50,
      cartoesFaturaAtualTotal: 0,
      cartoesLimiteComprometidoTotal: 0,
    },
    startDateIso: "2026-05-01",
    endDateIso: "2026-05-31",
  });

  assert.equal(metrics.hasDetailedSummaryMetrics, false);
  assert.equal(metrics.monthlyAverageTotal, 50);
  assert.equal(metrics.realChargeInPeriodTotal, 50);
});

test("relatórios serviços: prioriza campos novos quando overview os fornece", () => {
  const activeServicos = [buildServicoFixture({ id: "s-1", nome: "Servico A", valorMensal: "10.00" })];

  const metrics = buildRelatoriosServicosMetrics({
    activeServicos,
    overviewSummary: {
      incomeTotal: 0,
      expenseTotal: 0,
      balance: 0,
      patrimonioTotal: 0,
      dividasAPagar: 0,
      valoresAReceber: 0,
      gastosFixos: 0,
      servicosAtivosTotal: 0,
      servicosEquivalenteMensalTotal: 19.15,
      servicosCobrancaRealPeriodoTotal: 229.82,
      servicosVinculadosCartaoEquivalenteMensalTotal: 19.15,
      servicosVinculadosCartaoCobrancaRealPeriodoTotal: 229.82,
      servicosNaoVinculadosCartaoEquivalenteMensalTotal: 0,
      servicosNaoVinculadosCartaoCobrancaRealPeriodoTotal: 0,
      cartoesFaturaAtualTotal: 0,
      cartoesLimiteComprometidoTotal: 0,
    },
    startDateIso: "2026-05-01",
    endDateIso: "2026-05-31",
  });

  assert.equal(metrics.hasDetailedSummaryMetrics, true);
  assert.equal(metrics.monthlyAverageTotal, 19.15);
  assert.equal(metrics.realChargeInPeriodTotal, 229.82);
  assert.equal(metrics.linkedCardMonthlyAverageTotal, 19.15);
  assert.equal(metrics.linkedCardRealChargeInPeriodTotal, 229.82);
});

test("histórico financeiro: serviço anual só entra no mês de cobrança configurado", () => {
  const anualMaio = buildServicoFixture({
    id: "svc-distrokid",
    nome: "DistroKid",
    periodicidadeCobranca: "anual",
    valorCobranca: "229.82",
    valorMensal: "19.15",
    mesCobranca: 5,
    compraCartaoId: null,
    formaPagamento: "pix",
  });
  const anualJunho = buildServicoFixture({
    id: "svc-meliuz",
    nome: "Meliuz Prime",
    periodicidadeCobranca: "anual",
    valorCobranca: "99.90",
    valorMensal: "8.33",
    mesCobranca: 6,
    compraCartaoId: null,
    formaPagamento: "pix",
  });
  const anualAgosto = buildServicoFixture({
    id: "svc-google",
    nome: "Google One",
    periodicidadeCobranca: "anual",
    valorCobranca: "120.00",
    valorMensal: "10.00",
    mesCobranca: 8,
    compraCartaoId: null,
    formaPagamento: "pix",
  });

  const historico = withFakeNow("2026-08-15T12:00:00.000Z", () =>
    gerarHistoricoMensal([], [anualMaio, anualJunho, anualAgosto], 4, []),
  );

  assert.deepEqual(
    historico.map((item) => ({ mes: item.mes, despesas: item.despesas })),
    [
      { mes: "2026-05", despesas: 229.82 },
      { mes: "2026-06", despesas: 99.9 },
      { mes: "2026-07", despesas: 0 },
      { mes: "2026-08", despesas: 120 },
    ],
  );
});

test("simulador: gasto base de serviços respeita mes_cobranca no mês informado", () => {
  const anualMaio = buildServicoFixture({
    id: "svc-distrokid",
    nome: "DistroKid",
    periodicidadeCobranca: "anual",
    valorCobranca: "229.82",
    valorMensal: "19.15",
    mesCobranca: 5,
    compraCartaoId: null,
    formaPagamento: "pix",
  });
  const anualJunho = buildServicoFixture({
    id: "svc-meliuz",
    nome: "Meliuz Prime",
    periodicidadeCobranca: "anual",
    valorCobranca: "99.90",
    valorMensal: "8.33",
    mesCobranca: 6,
    compraCartaoId: null,
    formaPagamento: "pix",
  });
  const anualAgosto = buildServicoFixture({
    id: "svc-google",
    nome: "Google One",
    periodicidadeCobranca: "anual",
    valorCobranca: "120.00",
    valorMensal: "10.00",
    mesCobranca: 8,
    compraCartaoId: null,
    formaPagamento: "pix",
  });

  assert.equal(calculateSimuladorBaseServicos([anualMaio, anualJunho, anualAgosto], "2026-05"), 229.82);
  assert.equal(calculateSimuladorBaseServicos([anualMaio, anualJunho, anualAgosto], "2026-06"), 99.9);
  assert.equal(calculateSimuladorBaseServicos([anualMaio, anualJunho, anualAgosto], "2026-08"), 120);
});

function buildSimuladorRendaFixture(overrides: Partial<Renda> = {}): Renda {
  return {
    id: overrides.id ?? "renda-1",
    userId: overrides.userId ?? "user-1",
    tipo: overrides.tipo ?? "fixo",
    descricao: overrides.descricao ?? "Salário",
    valor: overrides.valor ?? "1000.00",
    diaRecebimento: overrides.diaRecebimento ?? 5,
    ativo: overrides.ativo ?? true,
  };
}

function buildSimuladorPatrimonioFixture(overrides: Partial<Patrimonio> = {}): Patrimonio {
  return {
    id: overrides.id ?? "patrimonio-1",
    userId: overrides.userId ?? "user-1",
    nome: overrides.nome ?? "Conta principal",
    tipo: overrides.tipo ?? "conta_bancaria",
    valorAtual: overrides.valorAtual ?? "1000.00",
    iconeId: overrides.iconeId ?? null,
  };
}

function buildFuturePurchaseContextFixture(overrides: Partial<{
  cartoes: Cartao[];
  compras: CompraCartao[];
  parcelasCompra: ParcelaCompra[];
  dividas: Divida[];
  parcelas: Parcela[];
  servicos: Servico[];
  rendas: Renda[];
  patrimonios: Patrimonio[];
}> = {}) {
  return {
    cartoes: overrides.cartoes ?? [buildCartaoViewFixture({ id: "card-1", nome: "Cartão principal", diaVencimento: 10, limite: "5000.00" })],
    compras: overrides.compras ?? [],
    parcelasCompra: overrides.parcelasCompra ?? [],
    dividas: overrides.dividas ?? [],
    parcelas: overrides.parcelas ?? [],
    servicos: overrides.servicos ?? [],
    rendas: overrides.rendas ?? [buildSimuladorRendaFixture()],
    patrimonios: overrides.patrimonios ?? [buildSimuladorPatrimonioFixture()],
  };
}

test("simulador compra futura: compra cabe no orçamento", () => {
  const context = buildFuturePurchaseContextFixture({
    servicos: [
      buildServicoFixture({
        id: "svc-streaming",
        nome: "Streaming",
        periodicidadeCobranca: "mensal",
        valorMensal: "500.00",
        valorCobranca: "500.00",
        dataCobranca: 12,
        compraCartaoId: null,
        formaPagamento: "pix",
      }),
    ],
    rendas: [buildSimuladorRendaFixture({ valor: "3000.00" })],
    patrimonios: [buildSimuladorPatrimonioFixture({ valorAtual: "1500.00" })],
  });

  const result = withFakeNow("2026-06-01T12:00:00.000Z", () => buildFuturePurchaseSimulation(context, {
    nomeCompra: "Notebook",
    valorTotal: 2000,
    parcelas: 10,
    cartaoId: "card-1",
    mesPrimeiraParcela: "2026-06",
    reservaMinima: 300,
    entradasExtras: [],
  }));

  assert.equal(result.status, "Pode comprar");
  assert.equal(result.monthsNegativeCount, 0);
  assert.equal(result.monthsBelowReserveCount, 0);
});

test("simulador compra futura: compra pode deixar saldo negativo em mês futuro", () => {
  const context = buildFuturePurchaseContextFixture({
    servicos: [
      buildServicoFixture({
        id: "svc-fixos",
        nome: "Custos fixos",
        periodicidadeCobranca: "mensal",
        valorMensal: "950.00",
        valorCobranca: "950.00",
        dataCobranca: 12,
        compraCartaoId: null,
        formaPagamento: "pix",
      }),
    ],
    rendas: [buildSimuladorRendaFixture({ valor: "1000.00" })],
    patrimonios: [buildSimuladorPatrimonioFixture({ valorAtual: "300.00" })],
  });

  const result = withFakeNow("2026-06-01T12:00:00.000Z", () => buildFuturePurchaseSimulation(context, {
    nomeCompra: "Celular",
    valorTotal: 5000,
    parcelas: 12,
    cartaoId: "card-1",
    mesPrimeiraParcela: "2026-06",
    reservaMinima: 0,
    entradasExtras: [],
  }));

  assert.equal(result.status, "Não recomendado");
  assert.ok(result.monthsNegativeCount >= 1);
  assert.ok(result.lowestBalance < 0);
});

test("simulador compra futura: compra pode ficar abaixo da reserva mínima", () => {
  const context = buildFuturePurchaseContextFixture({
    servicos: [
      buildServicoFixture({
        id: "svc-casa",
        nome: "Custos da casa",
        periodicidadeCobranca: "mensal",
        valorMensal: "850.00",
        valorCobranca: "850.00",
        dataCobranca: 12,
        compraCartaoId: null,
        formaPagamento: "pix",
      }),
    ],
    rendas: [buildSimuladorRendaFixture({ valor: "1000.00" })],
    patrimonios: [buildSimuladorPatrimonioFixture({ valorAtual: "1000.00" })],
  });

  const result = withFakeNow("2026-06-01T12:00:00.000Z", () => buildFuturePurchaseSimulation(context, {
    nomeCompra: "TV",
    valorTotal: 2000,
    parcelas: 10,
    cartaoId: "card-1",
    mesPrimeiraParcela: "2026-06",
    reservaMinima: 1000,
    entradasExtras: [],
  }));

  assert.equal(result.status, "Atenção");
  assert.equal(result.monthsNegativeCount, 0);
  assert.ok(result.monthsBelowReserveCount >= 1);
});

test("simulador compra futura: entrada extra simulada pode evitar saldo negativo", () => {
  const context = buildFuturePurchaseContextFixture({
    servicos: [
      buildServicoFixture({
        id: "svc-fixos",
        nome: "Custos fixos",
        periodicidadeCobranca: "mensal",
        valorMensal: "950.00",
        valorCobranca: "950.00",
        dataCobranca: 12,
        compraCartaoId: null,
        formaPagamento: "pix",
      }),
    ],
    rendas: [buildSimuladorRendaFixture({ valor: "1000.00" })],
    patrimonios: [buildSimuladorPatrimonioFixture({ valorAtual: "300.00" })],
  });

  const semEntradaExtra = withFakeNow("2026-06-01T12:00:00.000Z", () => buildFuturePurchaseSimulation(context, {
    nomeCompra: "Celular",
    valorTotal: 5000,
    parcelas: 12,
    cartaoId: "card-1",
    mesPrimeiraParcela: "2026-06",
    reservaMinima: 0,
    entradasExtras: [],
  }));
  const comEntradaExtra = withFakeNow("2026-06-01T12:00:00.000Z", () => buildFuturePurchaseSimulation(context, {
    nomeCompra: "Celular",
    valorTotal: 5000,
    parcelas: 12,
    cartaoId: "card-1",
    mesPrimeiraParcela: "2026-06",
    reservaMinima: 0,
    entradasExtras: [{
      id: "extra-1",
      descricao: "Freela",
      valor: 300,
      data: "2026-06-03",
      recorrente: true,
    }],
  }));

  assert.equal(semEntradaExtra.status, "Não recomendado");
  assert.ok(comEntradaExtra.lowestBalance > semEntradaExtra.lowestBalance);
  assert.ok(comEntradaExtra.monthsNegativeCount < semEntradaExtra.monthsNegativeCount);
});

test("simulador compra futura: serviço anual com mes_cobranca entra apenas no mês correto", () => {
  const context = buildFuturePurchaseContextFixture({
    servicos: [
      buildServicoFixture({
        id: "svc-anual",
        nome: "Meliuz Prime",
        periodicidadeCobranca: "anual",
        valorMensal: "8.33",
        valorCobranca: "99.90",
        dataCobranca: 10,
        mesCobranca: 6,
        compraCartaoId: null,
        formaPagamento: "pix",
      }),
    ],
    rendas: [buildSimuladorRendaFixture({ valor: "0.00" })],
    patrimonios: [buildSimuladorPatrimonioFixture({ valorAtual: "1000.00" })],
  });

  const months = withFakeNow("2026-05-01T12:00:00.000Z", () => projectFuturePurchaseCashflow(context, {
    nomeCompra: "Compra teste",
    valorTotal: 0,
    parcelas: 3,
    cartaoId: "card-1",
    mesPrimeiraParcela: "2026-05",
    reservaMinima: 0,
    entradasExtras: [],
  }));

  assert.deepEqual(
    months.slice(0, 3).map((month) => ({ mes: month.monthReference, saidas: month.actualExpenses })),
    [
      { mes: "2026-05", saidas: 0 },
      { mes: "2026-06", saidas: 99.9 },
      { mes: "2026-07", saidas: 0 },
    ],
  );
});

test("simulador compra futura: compra no cartão respeita faturas futuras já existentes", () => {
  const existingPurchase = buildCompraCartaoViewFixture({
    id: "compra-existente",
    cartaoId: "card-1",
    descricao: "Curso atual",
    valorTotal: "300.00",
    parcelas: 2,
    parcelaAtual: 1,
    valorParcela: "150.00",
    dataCompra: "2026-05-20",
    pessoaId: null,
    statusPessoa: null,
  });
  const existingInstallment = buildParcelaCompraViewFixture({
    id: "parcela-existente",
    compraCartaoId: "compra-existente",
    numero: 1,
    valor: "150.00",
    dataVencimento: "2026-06-10",
    statusCartao: "pendente",
    statusPessoa: null,
  });
  const context = buildFuturePurchaseContextFixture({
    compras: [existingPurchase],
    parcelasCompra: [existingInstallment],
    rendas: [buildSimuladorRendaFixture({ valor: "0.00" })],
    patrimonios: [buildSimuladorPatrimonioFixture({ valorAtual: "1000.00" })],
  });

  const months = withFakeNow("2026-06-01T12:00:00.000Z", () => projectFuturePurchaseCashflow(context, {
    nomeCompra: "Nova compra",
    valorTotal: 200,
    parcelas: 2,
    cartaoId: "card-1",
    mesPrimeiraParcela: "2026-06",
    reservaMinima: 0,
    entradasExtras: [],
  }));

  assert.equal(months[0]?.actualExpenses, 150);
  assert.equal(months[0]?.simulatedInstallment, 100);
});

test("simulador compra futura: valor máximo seguro é calculado considerando efeito acumulado", () => {
  const context = buildFuturePurchaseContextFixture({
    servicos: [
      buildServicoFixture({
        id: "svc-essencial",
        nome: "Essencial",
        periodicidadeCobranca: "mensal",
        valorMensal: "800.00",
        valorCobranca: "800.00",
        dataCobranca: 12,
        compraCartaoId: null,
        formaPagamento: "pix",
      }),
    ],
    rendas: [buildSimuladorRendaFixture({ valor: "1000.00" })],
    patrimonios: [buildSimuladorPatrimonioFixture({ valorAtual: "1000.00" })],
  });

  const safeAmount = withFakeNow("2026-06-01T12:00:00.000Z", () => calculateSafePurchaseAmount(context, {
    nomeCompra: "Compra segura",
    valorTotal: 2000,
    parcelas: 2,
    cartaoId: "card-1",
    mesPrimeiraParcela: "2026-06",
    reservaMinima: 500,
    entradasExtras: [],
  }));

  assert.equal(safeAmount, 900);
});

test("simulador compra futura: simulação não altera dados reais", () => {
  const context = buildFuturePurchaseContextFixture({
    servicos: [
      buildServicoFixture({
        id: "svc-anual",
        nome: "Google One",
        periodicidadeCobranca: "anual",
        valorMensal: "10.00",
        valorCobranca: "120.00",
        mesCobranca: 8,
        dataCobranca: 15,
        compraCartaoId: null,
        formaPagamento: "pix",
      }),
    ],
  });
  const input = {
    nomeCompra: "Compra imutável",
    valorTotal: 1200,
    parcelas: 6,
    cartaoId: "card-1",
    mesPrimeiraParcela: "2026-06",
    reservaMinima: 200,
    entradasExtras: [{
      id: "extra-imutavel",
      descricao: "Bônus",
      valor: 250,
      data: "2026-06-05",
      recorrente: false,
    }],
  } satisfies FuturePurchaseSimulationInput;

  const contextSnapshot = structuredClone(context);
  const inputSnapshot = structuredClone(input);

  withFakeNow("2026-06-01T12:00:00.000Z", () => {
    buildFuturePurchaseSimulation(context, input);
  });

  assert.deepEqual(context, contextSnapshot);
  assert.deepEqual(input, inputSnapshot);
});

test("serviços: impacto financeiro mensal exclui valores já representados por compra de cartão vinculada", () => {
  const servicoAnualVinculado = buildServicoFixture({
    periodicidadeCobranca: "anual",
    valorCobranca: "229.82",
    valorMensal: "19.15",
    compraCartaoId: "compra-1",
  });
  const servicoAnualSemVinculo = buildServicoFixture({
    periodicidadeCobranca: "anual",
    valorCobranca: "229.82",
    valorMensal: "19.15",
    compraCartaoId: null,
  });
  const servicoMensal = buildServicoFixture({
    periodicidadeCobranca: "mensal",
    valorCobranca: "50.00",
    valorMensal: "50.00",
    compraCartaoId: null,
  });

  assert.equal(calculateServicoMonthlyFinancialImpactAmount(servicoAnualVinculado), 0);
  assert.equal(calculateServicoMonthlyFinancialImpactAmount(servicoAnualSemVinculo), 19.15);
  assert.equal(calculateServicoMonthlyFinancialImpactAmount(servicoMensal), 50);
});

test("serviços: gasto fixo real mensal usa a competência e evita duplicidade com cartão", () => {
  const servicoAnualVinculado = {
    ...buildServicoFixture({
      periodicidadeCobranca: "anual",
      valorCobranca: "229.82",
      valorMensal: "19.15",
      compraCartaoId: "compra-1",
    }),
    competenciaBase: "2026-05",
  };
  const servicoAnualSemVinculo = {
    ...buildServicoFixture({
      periodicidadeCobranca: "anual",
      valorCobranca: "229.82",
      valorMensal: "19.15",
      compraCartaoId: null,
    }),
    competenciaBase: "2026-05",
  };
  const servicoMensal = buildServicoFixture({
    periodicidadeCobranca: "mensal",
    valorCobranca: "50.00",
    valorMensal: "50.00",
    compraCartaoId: null,
  });

  assert.equal(calculateServicoRealMonthlyExpenseAmount(servicoAnualVinculado, "2026-05"), 0);
  assert.equal(calculateServicoRealMonthlyExpenseAmount(servicoAnualSemVinculo, "2026-05"), 229.82);
  assert.equal(calculateServicoRealMonthlyExpenseAmount(servicoAnualSemVinculo, "2026-06"), 0);
  assert.equal(calculateServicoRealMonthlyExpenseAmount(servicoMensal, "2026-06"), 50);
});

test("calendário financeiro: inclui fatura e parcela do cartão sem duplicar serviço vinculado", () => {
  const cartao = buildCartaoViewFixture({
    id: "card-1",
    nome: "Mercado Pago Visa",
    diaVencimento: 10,
  });
  const compra = buildCompraCartaoViewFixture({
    id: "compra-servico-anual",
    cartaoId: "card-1",
    descricao: "DistroKid anual",
    valorTotal: "99.90",
    parcelas: 1,
    parcelaAtual: 1,
    valorParcela: "99.90",
    dataCompra: "2026-06-05",
    pessoaId: "pessoa-a",
    statusPessoa: "pendente",
  });
  const parcelaCompra = buildParcelaCompraViewFixture({
    id: "parcela-servico-anual",
    compraCartaoId: "compra-servico-anual",
    numero: 1,
    valor: "99.90",
    dataVencimento: "2026-06-10",
    statusCartao: "pendente",
    statusPessoa: "pendente",
  });
  const servicoAnualVinculado = buildServicoFixture({
    id: "servico-linked",
    nome: "DistroKid",
    periodicidadeCobranca: "anual",
    valorCobranca: "99.90",
    valorMensal: "8.33",
    dataCobranca: 10,
    mesCobranca: 6,
    compraCartaoId: "compra-servico-anual",
    formaPagamento: "cartao",
  });
  const servicoMensal = buildServicoFixture({
    id: "servico-netflix",
    nome: "Netflix",
    periodicidadeCobranca: "mensal",
    valorCobranca: "39.90",
    valorMensal: "39.90",
    dataCobranca: 15,
    compraCartaoId: null,
    formaPagamento: "pix",
  });

  const events = buildFinancialCalendarEvents({
    monthReference: "2026-06",
    cartoes: [cartao],
    compras: [compra],
    parcelasCompra: [parcelaCompra],
    dividas: [],
    parcelas: [],
    pessoas: [buildPessoaFixture({ id: "pessoa-a", nome: "Ana" })],
    servicos: [servicoAnualVinculado, servicoMensal],
    rendas: [],
    metas: [],
    referenceDate: "2026-06-01",
  });

  const invoiceEvent = events.find((event) => event.source === "fatura_cartao" && event.entityId === "card-1");
  const installmentEvent = events.find((event) => event.source === "parcela_compra" && event.entityId === "compra-servico-anual");
  const linkedServiceEvent = events.find((event) => event.source === "servico" && event.entityId === "servico-linked");
  const mensalServiceEvent = events.find((event) => event.source === "servico" && event.entityId === "servico-netflix");

  assert.ok(invoiceEvent);
  assert.equal(invoiceEvent?.date, "2026-06-10");
  assert.equal(invoiceEvent?.amount, 99.9);

  assert.ok(installmentEvent);
  assert.equal(installmentEvent?.statusLabel, "Cartão pendente");
  assert.equal(installmentEvent?.secondaryStatusLabel, "Ag. reembolso");

  assert.equal(linkedServiceEvent, undefined);
  assert.ok(mensalServiceEvent);
  assert.equal(mensalServiceEvent?.amount, 39.9);
});

test("calendário financeiro: respeita mês de cobrança anual e agrega renda, dívida parcelada e meta no mês correto", () => {
  const renda: Renda = {
    id: "renda-1",
    userId: "user-1",
    tipo: "fixo",
    descricao: "Salário",
    valor: "5000.00",
    diaRecebimento: 5,
    ativo: true,
  };
  const meta: Meta = {
    id: "meta-1",
    userId: "user-1",
    nome: "Reserva",
    descricao: "Juntar caixa",
    valorAlvo: "2000.00",
    valorAtual: "500.00",
    prazo: "2026-06-28",
    status: "ativa",
  };
  const pessoa = buildPessoaFixture({ id: "pessoa-b", nome: "Bruno" });
  const divida = buildDividaFixture({
    id: "divida-1",
    pessoaId: "pessoa-b",
    tipo: "receber",
    descricao: "Notebook parcelado",
    valor: "150.00",
    status: "pendente",
    dataVencimento: "2026-06-12",
  }) as Divida;
  const parcela: Parcela = {
    id: "parcela-divida-1",
    userId: "user-1",
    dividaId: "divida-1",
    numero: 2,
    valor: "150.00",
    dataVencimento: "2026-06-12",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    observacaoPagamento: null,
    comprovantePath: null,
    comprovanteNome: null,
    comprovanteMimeType: null,
    comprovanteTamanho: null,
    comprovanteEnviadoEm: null,
  };
  const parcelaAnterior: Parcela = {
    id: "parcela-divida-0",
    userId: "user-1",
    dividaId: "divida-1",
    numero: 1,
    valor: "150.00",
    dataVencimento: "2026-05-12",
    status: "pago",
    dataPagamento: "2026-05-12",
    formaPagamento: null,
    observacaoPagamento: null,
    comprovantePath: null,
    comprovanteNome: null,
    comprovanteMimeType: null,
    comprovanteTamanho: null,
    comprovanteEnviadoEm: null,
  };
  const servicoAnual = buildServicoFixture({
    id: "servico-anual",
    nome: "Meliuz Prime",
    periodicidadeCobranca: "anual",
    valorCobranca: "99.90",
    valorMensal: "8.33",
    dataCobranca: 10,
    mesCobranca: 6,
    compraCartaoId: null,
    formaPagamento: "pix",
  });

  const juneEvents = buildFinancialCalendarEvents({
    monthReference: "2026-06",
    cartoes: [],
    compras: [],
    parcelasCompra: [],
    dividas: [divida],
    parcelas: [parcelaAnterior, parcela],
    pessoas: [pessoa],
    servicos: [servicoAnual],
    rendas: [renda],
    metas: [meta],
    referenceDate: "2026-06-01",
  });
  const mayEvents = buildFinancialCalendarEvents({
    monthReference: "2026-05",
    cartoes: [],
    compras: [],
    parcelasCompra: [],
    dividas: [divida],
    parcelas: [parcelaAnterior, parcela],
    pessoas: [pessoa],
    servicos: [servicoAnual],
    rendas: [renda],
    metas: [meta],
    referenceDate: "2026-05-01",
  });

  const juneService = juneEvents.find((event) => event.source === "servico" && event.entityId === "servico-anual");
  const mayService = mayEvents.find((event) => event.source === "servico" && event.entityId === "servico-anual");
  const rendaEvent = juneEvents.find((event) => event.source === "renda_prevista" && event.entityId === "renda-1");
  const debtEvent = juneEvents.find((event) => event.source === "divida_receber" && event.entityId === "divida-1");
  const metaEvent = juneEvents.find((event) => event.source === "meta_prazo" && event.entityId === "meta-1");

  assert.ok(juneService);
  assert.equal(juneService?.date, "2026-06-10");
  assert.equal(juneService?.amount, 99.9);
  assert.equal(mayService, undefined);

  assert.ok(rendaEvent);
  assert.equal(rendaEvent?.date, "2026-06-05");
  assert.equal(rendaEvent?.direction, "entrada");

  assert.ok(debtEvent);
  assert.equal(debtEvent?.date, "2026-06-12");
  assert.equal(debtEvent?.subtitle, "Bruno · Parcela 2/2");

  assert.ok(metaEvent);
  assert.equal(metaEvent?.date, "2026-06-28");
  assert.equal(metaEvent?.amount, 1500);
});

test("calendário financeiro: usa fallback legado para parcela futura sem materialização", () => {
  const cartao = buildCartaoViewFixture({
    id: "card-fallback",
    nome: "Cartão legado",
    diaVencimento: 12,
  });
  const compra = {
    ...buildCompraCartaoViewFixture({
      id: "compra-legada",
      cartaoId: "card-fallback",
      descricao: "Notebook legado",
      valorTotal: "1200.00",
      parcelas: 3,
      parcelaAtual: 2,
      valorParcela: "400.00",
      dataCompra: "2026-04-08",
    }),
    pessoaId: null,
    statusPessoa: null,
  } as CompraCartao;

  const events = buildFinancialCalendarEvents({
    monthReference: "2026-05",
    cartoes: [cartao],
    compras: [compra],
    parcelasCompra: [],
    dividas: [],
    parcelas: [],
    pessoas: [],
    servicos: [],
    rendas: [],
    metas: [],
    referenceDate: "2026-05-01",
  });

  const installmentEvent = events.find((event) => event.source === "parcela_compra" && event.entityId === "compra-legada");

  assert.ok(installmentEvent);
  assert.equal(installmentEvent?.date, "2026-05-12");
  assert.equal(installmentEvent?.amount, 400);
  assert.equal(installmentEvent?.secondaryStatusLabel, undefined);
});
