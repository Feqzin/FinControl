import { isPast, parseISO } from "date-fns";
import { formatIsoDateToBR, formatCurrencyBRL } from "@/utils/formatters";
import { addMonths, format } from "date-fns";
import { buildCompraReembolsoBreakdown } from "@shared/compra-reembolso";
import type { Cartao, CompraCartao, Divida, Parcela, ParcelaCompra } from "@shared/schema";

export const FORMAS_PAGAMENTO_DIVIDA = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "cartao", label: "Cartão" },
  { value: "transferencia", label: "Transferência" },
  { value: "boleto", label: "Boleto" },
] as const;

export function formatDividaCurrency(value: number): string {
  return formatCurrencyBRL(value);
}

export function formatDividaDate(value?: string | null): string {
  return formatIsoDateToBR(value);
}

export function isOverdueDate(value?: string | null): boolean {
  if (!value) return false;
  try {
    return isPast(parseISO(`${value}T23:59:59`));
  } catch {
    return false;
  }
}

export type DividaSortBy =
  | "vencimento_mais_proximo"
  | "vencimento_mais_distante"
  | "mais_recente"
  | "mais_antigo"
  | "maior_valor"
  | "menor_valor"
  | "nome_az"
  | "nome_za"
  | "status";

export type DividaSortable = Divida & { parcelas: Parcela[] };

export type DividaOrigemFilter = "todos" | "manual" | "cartao";
export type DividaViewOrigin = "manual" | "cartao";
export type DividaViewStatus = "pendente" | "pago" | "vencido";

export type DividaViewItem = {
  id: string;
  sourceId: string;
  origin: DividaViewOrigin;
  pessoaId: string;
  tipo: "receber" | "pagar";
  expectativaRecebimento: boolean;
  status: DividaViewStatus;
  descricao: string | null;
  dataReferencia: string | null;
  valorTotal: number;
  valorPendente: number;
  valorPago: number;
  parcelasTotal: number;
  parcelasPagas: number;
  parcelasPendentes: number;
  parcelasVencidas: number;
  proximaParcelaData: string | null;
  proximaParcelaValor: number | null;
  cardLabel: string | null;
  cardTotalCompra: number | null;
  mensalPessoa: number | null;
  manual: DividaSortable | null;
  compraCartao: CompraCartao | null;
};

type SortDividasOptions = {
  sortBy: DividaSortBy;
  getPessoaNome: (pessoaId: string) => string;
  getDividaStatus: (divida: DividaSortable) => string;
  nowIsoDate?: string;
};

function toDateTimestamp(value?: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(`${value}T00:00:00`);
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return parsed;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toDateTimestampDesc(value?: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(`${value}T00:00:00`);
  if (!Number.isFinite(parsed)) return Number.NEGATIVE_INFINITY;
  return parsed;
}

function getCreatedAtMaybe(divida: DividaSortable): string | null {
  const maybeCreatedAt = (divida as Record<string, unknown>).createdAt;
  return typeof maybeCreatedAt === "string" && maybeCreatedAt.length > 0 ? maybeCreatedAt : null;
}

function getPrimaryDueDate(divida: DividaSortable): string | null {
  if (divida.parcelas.length === 0) return divida.dataVencimento ?? null;

  const pendentesOrdenadas = divida.parcelas
    .filter((parcela) => parcela.status === "pendente")
    .sort((a, b) => (a.dataVencimento ?? "").localeCompare(b.dataVencimento ?? ""));

  if (pendentesOrdenadas.length > 0) return pendentesOrdenadas[0]?.dataVencimento ?? null;

  const todasOrdenadas = [...divida.parcelas].sort((a, b) => (a.dataVencimento ?? "").localeCompare(b.dataVencimento ?? ""));
  return todasOrdenadas[0]?.dataVencimento ?? divida.dataVencimento ?? null;
}

function getDisplayTotal(divida: DividaSortable): number {
  if (divida.parcelas.length === 0) return Number(divida.valor) || 0;
  return divida.parcelas.reduce((sum, parcela) => sum + (Number(parcela.valor) || 0), 0);
}

function getEffectiveStatusSortRank(
  divida: DividaSortable,
  getDividaStatus: (divida: DividaSortable) => string,
  nowIsoDate: string,
): number {
  const status = getDividaStatus(divida);
  if (status === "pago") return 2;

  const isVencida = divida.parcelas.length > 0
    ? divida.parcelas.some((parcela) => parcela.status === "pendente" && Boolean(parcela.dataVencimento && parcela.dataVencimento < nowIsoDate))
    : status === "pendente" && Boolean(divida.dataVencimento && divida.dataVencimento < nowIsoDate);

  return isVencida ? 0 : 1;
}

export function sortDividasForView(dividas: DividaSortable[], options: SortDividasOptions): DividaSortable[] {
  if (!Array.isArray(dividas) || dividas.length === 0) {
    return [];
  }

  const { sortBy, getPessoaNome, getDividaStatus } = options;
  const nowIsoDate = options.nowIsoDate ?? new Date().toISOString().slice(0, 10);
  const normalizedName = (pessoaId: string) => {
    try {
      return normalizeText(getPessoaNome(pessoaId));
    } catch {
      return "";
    }
  };
  const resolveStatus = (divida: DividaSortable) => {
    try {
      return getDividaStatus(divida);
    } catch {
      return "pendente";
    }
  };

  const sorted = [...dividas].sort((a, b) => {
    switch (sortBy) {
      case "vencimento_mais_distante": {
        const diff = toDateTimestampDesc(getPrimaryDueDate(b)) - toDateTimestampDesc(getPrimaryDueDate(a));
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
      case "mais_recente": {
        const aRef = getCreatedAtMaybe(a) ?? getPrimaryDueDate(a);
        const bRef = getCreatedAtMaybe(b) ?? getPrimaryDueDate(b);
        const diff = toDateTimestampDesc(bRef) - toDateTimestampDesc(aRef);
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
      case "mais_antigo": {
        const aRef = getCreatedAtMaybe(a) ?? getPrimaryDueDate(a);
        const bRef = getCreatedAtMaybe(b) ?? getPrimaryDueDate(b);
        const diff = toDateTimestamp(aRef) - toDateTimestamp(bRef);
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
      case "maior_valor": {
        const diff = getDisplayTotal(b) - getDisplayTotal(a);
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
      case "menor_valor": {
        const diff = getDisplayTotal(a) - getDisplayTotal(b);
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
      case "nome_za":
        return normalizedName(b.pessoaId).localeCompare(normalizedName(a.pessoaId));
      case "status": {
        const diff = getEffectiveStatusSortRank(a, resolveStatus, nowIsoDate) - getEffectiveStatusSortRank(b, resolveStatus, nowIsoDate);
        if (diff !== 0) return diff;
        return toDateTimestamp(getPrimaryDueDate(a)) - toDateTimestamp(getPrimaryDueDate(b));
      }
      case "nome_az":
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      case "vencimento_mais_proximo":
      default: {
        const diff = toDateTimestamp(getPrimaryDueDate(a)) - toDateTimestamp(getPrimaryDueDate(b));
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
    }
  });

  return sorted;
}

function normalizeStatusText(status: string | null | undefined): string {
  return String(status ?? "").trim().toLowerCase();
}

function isStatusPaid(status: string | null | undefined): boolean {
  const normalized = normalizeStatusText(status);
  return normalized === "pago" || normalized === "reembolsado";
}

function isStatusCanceled(status: string | null | undefined): boolean {
  const normalized = normalizeStatusText(status);
  return normalized === "cancelado" || normalized === "cancelada";
}

function toMoneyNumber(value: string | number | null | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function resolveParcelaDueDate(baseDate: string, parcelaNumero: number): string | null {
  try {
    return format(addMonths(parseISO(baseDate), Math.max(0, parcelaNumero - 1)), "yyyy-MM-dd");
  } catch {
    return null;
  }
}

type BuildDividasViewItemsArgs = {
  dividasManuais: DividaSortable[];
  comprasCartaoVinculadas: CompraCartao[];
  parcelasCompra: ParcelaCompra[];
  cartoes: Cartao[];
  getDividaStatus: (divida: DividaSortable) => string;
  getDividaValorPendente: (divida: DividaSortable) => number;
  getDividaValorPago: (divida: DividaSortable) => number;
};

export function buildDividasViewItems({
  dividasManuais,
  comprasCartaoVinculadas,
  parcelasCompra,
  cartoes,
  getDividaStatus,
  getDividaValorPendente,
  getDividaValorPago,
}: BuildDividasViewItemsArgs): DividaViewItem[] {
  const cartaoNomeById = new Map(cartoes.map((cartao) => [cartao.id, cartao.nome]));
  const parcelasCompraByCompraId = new Map<string, ParcelaCompra[]>();
  for (const parcela of parcelasCompra) {
    const compraCartaoId = String(parcela.compraCartaoId ?? "");
    if (!compraCartaoId) continue;
    const current = parcelasCompraByCompraId.get(compraCartaoId);
    if (current) {
      current.push(parcela);
      continue;
    }
    parcelasCompraByCompraId.set(compraCartaoId, [parcela]);
  }
  const todayIso = new Date().toISOString().slice(0, 10);

  const manualItems: DividaViewItem[] = dividasManuais.map((divida) => {
    const statusBase = getDividaStatus(divida);
    const hasParcelas = divida.parcelas.length > 0;
    const parcelasPendentes = hasParcelas
      ? divida.parcelas.filter((parcela) => parcela.status === "pendente").length
      : (statusBase === "pago" ? 0 : 1);
    const parcelasPagas = hasParcelas
      ? divida.parcelas.filter((parcela) => parcela.status === "pago").length
      : (statusBase === "pago" ? 1 : 0);
    const parcelasVencidas = hasParcelas
      ? divida.parcelas.filter((parcela) => parcela.status === "pendente" && Boolean(parcela.dataVencimento && parcela.dataVencimento < todayIso)).length
      : (statusBase !== "pago" && Boolean(divida.dataVencimento && divida.dataVencimento < todayIso) ? 1 : 0);
    const status = statusBase === "pago" ? "pago" : (parcelasVencidas > 0 ? "vencido" : "pendente");
    const proximaParcela = hasParcelas
      ? [...divida.parcelas]
        .filter((parcela) => parcela.status === "pendente")
        .sort((a, b) => (a.dataVencimento ?? "").localeCompare(b.dataVencimento ?? ""))[0]
      : null;
    const valorTotal = hasParcelas
      ? divida.parcelas.reduce((sum, parcela) => sum + toMoneyNumber(parcela.valor), 0)
      : toMoneyNumber(divida.valor);

    return {
      id: `manual:${divida.id}`,
      sourceId: divida.id,
      origin: "manual",
      pessoaId: divida.pessoaId,
      tipo: divida.tipo === "pagar" ? "pagar" : "receber",
      expectativaRecebimento: divida.expectativaRecebimento !== false,
      status,
      descricao: divida.descricao ?? null,
      dataReferencia: hasParcelas
        ? (proximaParcela?.dataVencimento ?? divida.dataVencimento ?? null)
        : (divida.dataVencimento ?? null),
      valorTotal: round2(valorTotal),
      valorPendente: round2(getDividaValorPendente(divida)),
      valorPago: round2(getDividaValorPago(divida)),
      parcelasTotal: hasParcelas ? divida.parcelas.length : 1,
      parcelasPagas,
      parcelasPendentes,
      parcelasVencidas,
      proximaParcelaData: proximaParcela?.dataVencimento ?? null,
      proximaParcelaValor: proximaParcela ? round2(toMoneyNumber(proximaParcela.valor)) : null,
      cardLabel: null,
      cardTotalCompra: null,
      mensalPessoa: null,
      manual: divida,
      compraCartao: null,
    };
  });

  const cartaoItems: DividaViewItem[] = comprasCartaoVinculadas
    .filter((compra) => typeof compra.pessoaId === "string" && compra.pessoaId.trim().length > 0)
    .map((compra) => {
      const pessoaId = String(compra.pessoaId);
      const breakdown = buildCompraReembolsoBreakdown(compra);
      const valorTotalReembolso = round2(breakdown.reembolsoPessoa);
      const cartaoNome = cartaoNomeById.get(compra.cartaoId) ?? "Cartão";
      const parcelasDaCompra = (parcelasCompraByCompraId.get(compra.id) ?? [])
        .filter((parcela) => Number.isFinite(Number(parcela.numero)))
        .filter((parcela) => Number(parcela.numero) >= 1 && Number(parcela.numero) <= breakdown.totalParcelas)
        .sort((a, b) => Number(a.numero) - Number(b.numero));

      const parcelasByNumero = new Map<number, ParcelaCompra>();
      for (const parcela of parcelasDaCompra) {
        const numero = Number(parcela.numero);
        if (!Number.isFinite(numero) || numero < 1) continue;
        if (!parcelasByNumero.has(numero)) {
          parcelasByNumero.set(numero, parcela);
        }
      }

      let parcelasPagas = 0;
      let parcelasPendentes = 0;
      let parcelasVencidas = 0;
      let valorPagoCents = 0;
      let valorPendenteCents = 0;
      let proximaParcelaData: string | null = null;
      let proximaParcelaValorCents = 0;

      const hasCronogramaParcelas = parcelasByNumero.size > 0;

      if (hasCronogramaParcelas) {
        for (let numero = 1; numero <= breakdown.totalParcelas; numero += 1) {
          const parcelaCents = breakdown.reembolsoPorParcelaCents[numero - 1] ?? 0;
          if (parcelaCents <= 0) continue;

          const parcela = parcelasByNumero.get(numero);
          const statusPessoaParcela = normalizeStatusText(parcela?.statusPessoa);

          if (isStatusCanceled(statusPessoaParcela) || isStatusPaid(statusPessoaParcela)) {
            parcelasPagas += 1;
            valorPagoCents += parcelaCents;
            continue;
          }

          parcelasPendentes += 1;
          valorPendenteCents += parcelaCents;

          const vencimentoParcela = parcela?.dataVencimento ?? resolveParcelaDueDate(compra.dataCompra, numero);
          if (vencimentoParcela && vencimentoParcela < todayIso) {
            parcelasVencidas += 1;
          }

          if (!proximaParcelaData) {
            proximaParcelaData = vencimentoParcela ?? null;
            proximaParcelaValorCents = parcelaCents;
          } else if (vencimentoParcela && vencimentoParcela < proximaParcelaData) {
            proximaParcelaData = vencimentoParcela;
            proximaParcelaValorCents = parcelaCents;
          }
        }
      } else {
        const statusPessoaCompra = normalizeStatusText(compra.statusPessoa);
        const isPaidCompra = isStatusPaid(statusPessoaCompra);
        const isCanceledCompra = isStatusCanceled(statusPessoaCompra);
        const fromCurrent = breakdown.reembolsoPorParcelaCents.slice(Math.max(0, breakdown.parcelaAtual - 1));
        const pendenteCents = isPaidCompra || isCanceledCompra
          ? 0
          : fromCurrent.reduce((sum, value) => sum + value, 0);

        valorPendenteCents = pendenteCents;
        valorPagoCents = Math.max(0, breakdown.reembolsoPessoaCents - pendenteCents);
        parcelasPendentes = isPaidCompra || isCanceledCompra
          ? 0
          : fromCurrent.filter((value) => value > 0).length;
        parcelasPagas = isPaidCompra
          ? breakdown.totalParcelas
          : Math.max(0, breakdown.totalParcelas - parcelasPendentes);

        proximaParcelaData = resolveParcelaDueDate(compra.dataCompra, breakdown.parcelaAtual);
        proximaParcelaValorCents = breakdown.reembolsoPorParcelaCents[Math.max(0, breakdown.parcelaAtual - 1)] ?? 0;

        if (parcelasPendentes > 0 && proximaParcelaData && proximaParcelaData < todayIso) {
          parcelasVencidas = 1;
        }
      }

      const valorPendente = round2(valorPendenteCents / 100);
      const valorPago = round2(valorPagoCents / 100);
      const status: DividaViewStatus = parcelasPendentes === 0
        ? "pago"
        : (parcelasVencidas > 0 ? "vencido" : "pendente");
      const mensalAtual = round2((proximaParcelaValorCents || 0) / 100);

      return {
        id: `cartao:${compra.id}`,
        sourceId: compra.id,
        origin: "cartao",
        pessoaId,
        tipo: "receber",
        expectativaRecebimento: true,
        status,
        descricao: `${compra.descricao} · Cartão ${cartaoNome} · Reembolso parcial`,
        dataReferencia: proximaParcelaData ?? compra.dataCompra,
        valorTotal: valorTotalReembolso,
        valorPendente,
        valorPago,
        parcelasTotal: breakdown.totalParcelas,
        parcelasPagas,
        parcelasPendentes,
        parcelasVencidas,
        proximaParcelaData,
        proximaParcelaValor: mensalAtual,
        cardLabel: cartaoNome,
        cardTotalCompra: round2(breakdown.valorCompra),
        mensalPessoa: mensalAtual,
        manual: null,
        compraCartao: compra,
      };
    });

  return [...manualItems, ...cartaoItems];
}

type FilterDividasViewItemsArgs = {
  items: DividaViewItem[];
  search: string;
  filterTipo: string;
  filterStatus: string;
  filterOrigin: DividaOrigemFilter;
  getPessoaNome: (pessoaId: string) => string;
};

export function filterDividasViewItems({
  items,
  search,
  filterTipo,
  filterStatus,
  filterOrigin,
  getPessoaNome,
}: FilterDividasViewItemsArgs): DividaViewItem[] {
  const termo = normalizeText(search);
  const statusFilter = normalizeText(filterStatus);
  const tipoFilter = normalizeText(filterTipo);

  return items
    .filter((item) => filterOrigin === "todos" || item.origin === filterOrigin)
    .filter((item) => {
      if (!termo) return true;
      const pessoa = normalizeText(getPessoaNome(item.pessoaId));
      const descricao = normalizeText(item.descricao ?? "");
      const origem = item.origin === "cartao" ? "cartao" : "divida";
      return pessoa.includes(termo) || descricao.includes(termo) || origem.includes(termo);
    })
    .filter((item) => tipoFilter === "todos" || item.tipo === tipoFilter)
    .filter((item) => {
      if (statusFilter === "todos") return true;
      if (statusFilter === "sem_expectativa") {
        return item.tipo === "receber"
          && !item.expectativaRecebimento
          && item.status !== "pago";
      }
      if (statusFilter === "vencido") {
        return item.status === "vencido" && item.expectativaRecebimento;
      }
      if (statusFilter === "pendente") {
        return (item.status === "pendente" || item.status === "vencido")
          && item.expectativaRecebimento;
      }
      if (statusFilter === "pago") return item.status === "pago";
      return true;
    });
}

export function getDividasViewPendingTotals(items: DividaViewItem[]) {
  return items.reduce((totals, item) => {
    if (item.status === "pago") return totals;

    if (item.origin === "manual" && item.tipo === "pagar") {
      totals.pagar += item.valorPendente;
      return totals;
    }

    if (item.tipo !== "receber") return totals;
    if (item.expectativaRecebimento) {
      totals.receberEsperado += item.valorPendente;
    } else {
      totals.semExpectativa += item.valorPendente;
    }
    return totals;
  }, {
    receberEsperado: 0,
    semExpectativa: 0,
    pagar: 0,
  });
}

type SortDividasViewItemsOptions = {
  sortBy: DividaSortBy;
  getPessoaNome: (pessoaId: string) => string;
  nowIsoDate?: string;
};

function statusRank(status: DividaViewStatus): number {
  if (status === "vencido") return 0;
  if (status === "pendente") return 1;
  return 2;
}

export function sortDividasViewItems(items: DividaViewItem[], options: SortDividasViewItemsOptions): DividaViewItem[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const { sortBy, getPessoaNome } = options;
  const normalizedName = (pessoaId: string) => normalizeText(getPessoaNome(pessoaId));

  return [...items].sort((a, b) => {
    switch (sortBy) {
      case "vencimento_mais_distante": {
        const diff = toDateTimestampDesc(b.dataReferencia) - toDateTimestampDesc(a.dataReferencia);
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
      case "mais_recente": {
        const diff = toDateTimestampDesc(b.dataReferencia) - toDateTimestampDesc(a.dataReferencia);
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
      case "mais_antigo": {
        const diff = toDateTimestamp(a.dataReferencia) - toDateTimestamp(b.dataReferencia);
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
      case "maior_valor": {
        const diff = b.valorTotal - a.valorTotal;
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
      case "menor_valor": {
        const diff = a.valorTotal - b.valorTotal;
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
      case "nome_za":
        return normalizedName(b.pessoaId).localeCompare(normalizedName(a.pessoaId));
      case "status": {
        const diff = statusRank(a.status) - statusRank(b.status);
        if (diff !== 0) return diff;
        return toDateTimestamp(a.dataReferencia) - toDateTimestamp(b.dataReferencia);
      }
      case "nome_az":
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      case "vencimento_mais_proximo":
      default: {
        const diff = toDateTimestamp(a.dataReferencia) - toDateTimestamp(b.dataReferencia);
        if (diff !== 0) return diff;
        return normalizedName(a.pessoaId).localeCompare(normalizedName(b.pessoaId));
      }
    }
  });
}
