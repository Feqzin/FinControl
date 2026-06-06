import { addMonths, format, parseISO } from "date-fns";
import type { CompraCartao, Divida, ParcelaCompra, Pessoa, PessoaSaldoMovimentacao, ServicoPagamento, ServicoPessoa } from "@shared/schema";
import { buildCompraReembolsoBreakdown } from "@shared/compra-reembolso";
import type { IStorage } from "../storage";
import type {
  PessoaBodyInput,
  PessoaRecoverOrphanLinksBodyInput,
  PessoaUpdateBodyInput,
} from "../validators/core-domain.validators";

export type PessoaListStatus = "active" | "removed" | "all";

export type PessoaOrphanLinksGroup = {
  orphanGroupKey: string;
  nomeSugerido: string;
  sourcePessoaId: string;
  dividasCount: number;
  linkedServicosCount: number;
  linkedComprasCount: number;
  totalAReceber: number;
  totalAPagar: number;
  exemplos: Array<{
    dividaId: string;
    descricao: string | null;
    tipo: "receber" | "pagar" | string;
    valor: string;
    status: string;
  }>;
};

export type RecoverOrphanLinksResult =
  | { error: "ORPHAN_GROUP_KEY_INVALID" }
  | { error: "TARGET_PESSOA_NOT_FOUND" }
  | { error: "TARGET_PESSOA_REMOVED" }
  | { error: "NOME_REQUIRED" }
  | { error: "ORPHAN_GROUP_NOT_FOUND" }
  | {
    pessoaId: string;
    createdPessoa: boolean;
    linkedDividasCount: number;
    linkedServicosCount: number;
    linkedComprasCount: number;
  };

export type DeletePessoaPermanentResult =
  | { error: "NOT_FOUND" }
  | { error: "PESSOA_ATIVA" }
  | { error: "PESSOA_COM_VINCULOS" }
  | { ok: true };

type MoneyValue = string | number | null | undefined;

type PessoaResumoDividaBloco = {
  pendente: number;
  pago: number;
  vencidas: number;
  quantidadePendentes: number;
};

export type PessoaSaldoResumo = {
  creditos: number;
  debitos: number;
  saldoAtual: number;
  movimentacoes: number;
  ultimaMovimentacaoData: string | null;
};

export type PessoaSaldoMovimentacaoComSaldo = PessoaSaldoMovimentacao & {
  saldoAposMovimentacao: number;
};

export type PessoaSaldoMovimentacoesResponse = {
  pessoa: Pessoa;
  resumo: PessoaSaldoResumo;
  movimentacoes: PessoaSaldoMovimentacaoComSaldo[];
};

export type PessoaResumo = {
  pessoa: Pessoa;
  totais: {
    dividas: {
      comigo: PessoaResumoDividaBloco;
      euDevo: PessoaResumoDividaBloco;
      pagueiDoMeuBolso: {
        pendente: number;
        pago: number;
        parcelasPendentes: number;
      };
    };
    comprasVinculadas: {
      pendentePessoa: number;
      pagoPessoa: number;
      parcelasPendentesPessoa: number;
      comprasComParcelasReais: number;
      comprasEmFallbackLegado: number;
    };
    servicosMesAtual: {
      escopo: "mes_atual";
      mesReferencia: string;
      pendente: number;
      pago: number;
      pendentesQuantidade: number;
      totalVinculos: number;
    };
    saldoPessoa: PessoaSaldoResumo;
    consolidadoPendente: number;
  };
  alertas: {
    comprasAtrasadas: number;
    parcelasVencidasPessoa?: number;
    servicosPendentes: number;
    parcelasPendentesPessoa: number;
  };
};

const ORPHAN_GROUP_KEY_PREFIX = "pessoa_id:";

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePersonName(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toMoneyNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isOutstandingStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized !== "pago" && normalized !== "cancelado";
}

function buildOrphanGroupKey(sourcePessoaId: string): string {
  return `${ORPHAN_GROUP_KEY_PREFIX}${sourcePessoaId}`;
}

function parseOrphanGroupKey(orphanGroupKey: string): string | null {
  if (!orphanGroupKey.startsWith(ORPHAN_GROUP_KEY_PREFIX)) return null;
  const sourcePessoaId = orphanGroupKey.slice(ORPHAN_GROUP_KEY_PREFIX.length).trim();
  return sourcePessoaId.length > 0 ? sourcePessoaId : null;
}

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toLowerCase();
}

function extractServicoMesFromCategoria(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  const prefix = "servico_mes:";
  if (!normalized.startsWith(prefix)) return null;
  const mes = normalized.slice(prefix.length);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : null;
}

function getServicoMesSaldoAbatido(
  rows: PessoaSaldoMovimentacao[],
  servicoPessoaId: string,
  mes: string,
): number {
  let total = 0;
  for (const row of rows) {
    if (row.tipo !== "debito") continue;
    if (row.servicoPessoaId !== servicoPessoaId) continue;
    if (normalizeStatus(row.origem) !== "abatimento_servico") continue;
    if (extractServicoMesFromCategoria(row.categoria) !== mes) continue;
    total += toMoneyNumber(row.valor);
  }
  return round2(total);
}

function getParcelaCompraSaldoAbatido(
  rows: PessoaSaldoMovimentacao[],
  parcelaCompraId: string,
): number {
  let total = 0;
  for (const row of rows) {
    if (row.tipo !== "debito") continue;
    if (row.parcelaCompraId !== parcelaCompraId) continue;
    if (normalizeStatus(row.origem) !== "abatimento_parcela_cartao") continue;
    total += toMoneyNumber(row.valor);
  }
  return round2(total);
}

function getPagamentoServicoMesContexto(rows: ServicoPagamento[], mes: string): ServicoPagamento | null {
  const sameMonth = rows.filter((row) => row.mes === mes);
  if (sameMonth.length === 0) return null;
  const pago = sameMonth.find((row) => normalizeStatus(row.status) === "pago");
  if (pago) return pago;
  const parcial = sameMonth.find((row) => normalizeStatus(row.status) === "parcial");
  if (parcial) return parcial;
  return sameMonth[0] ?? null;
}

function timestampToMillis(value: unknown): number {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getTime();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }
  return 0;
}

function compareSaldoMovimentacoesAsc(a: PessoaSaldoMovimentacao, b: PessoaSaldoMovimentacao): number {
  const byData = String(a.data ?? "").localeCompare(String(b.data ?? ""));
  if (byData !== 0) return byData;

  const byCreatedAt = timestampToMillis(a.createdAt) - timestampToMillis(b.createdAt);
  if (byCreatedAt !== 0) return byCreatedAt;

  return String(a.id).localeCompare(String(b.id));
}

function buildPessoaSaldoResumo(rows: PessoaSaldoMovimentacao[]): PessoaSaldoResumo {
  let creditos = 0;
  let debitos = 0;

  for (const row of rows) {
    const valor = toMoneyNumber(row.valor);
    if (row.tipo === "credito") {
      creditos += valor;
    } else {
      debitos += valor;
    }
  }

  const ordered = [...rows].sort(compareSaldoMovimentacoesAsc);
  const ultimaMovimentacao = ordered.length > 0 ? ordered[ordered.length - 1] : null;

  return {
    creditos: round2(creditos),
    debitos: round2(debitos),
    saldoAtual: round2(creditos - debitos),
    movimentacoes: rows.length,
    ultimaMovimentacaoData: ultimaMovimentacao?.data ?? null,
  };
}

function buildPessoaSaldoMovimentacoes(rows: PessoaSaldoMovimentacao[]): PessoaSaldoMovimentacaoComSaldo[] {
  let saldoAcumulado = 0;
  const orderedAsc = [...rows].sort(compareSaldoMovimentacoesAsc);
  const withRunningBalance = orderedAsc.map((row) => {
    const valor = toMoneyNumber(row.valor);
    saldoAcumulado += row.tipo === "credito" ? valor : -valor;

    return {
      ...row,
      saldoAposMovimentacao: round2(saldoAcumulado),
    };
  });

  return withRunningBalance.reverse();
}

function isPaid(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "pago";
}

function isCanceled(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "cancelado";
}

function isOutstanding(status: string | null | undefined): boolean {
  return !isPaid(status) && !isCanceled(status);
}

function isOverdue(dateValue: string | null | undefined, todayIso: string): boolean {
  return Boolean(dateValue) && String(dateValue) < todayIso;
}

function getFallbackInstallmentDueDate(baseDate: string, offset: number): string | null {
  try {
    return format(addMonths(parseISO(baseDate), offset), "yyyy-MM-dd");
  } catch {
    return null;
  }
}

type CompraResumo = {
  pendentePessoa: number;
  pagoPessoa: number;
  parcelasPendentesPessoa: number;
  parcelasAtrasadasPessoa: number;
  compraAtrasada: boolean;
  usaParcelasReais: boolean;
};

function summarizeCompraPessoa(
  compra: CompraCartao,
  rows: ParcelaCompra[],
  todayIso: string,
  saldoMovimentacoes: PessoaSaldoMovimentacao[],
): CompraResumo {
  const reembolso = buildCompraReembolsoBreakdown(compra);
  const getParcelaReembolsoCents = (numero: number | null | undefined): number => {
    const parsed = Number(numero ?? 1);
    const fallback = Number.isFinite(parsed) ? Math.trunc(parsed) : 1;
    const index = Math.max(1, Math.min(reembolso.totalParcelas, fallback)) - 1;
    return reembolso.reembolsoPorParcelaCents[index] ?? 0;
  };

  if (rows.length > 0) {
    let pendentePessoa = 0;
    let pagoPessoa = 0;
    let parcelasPendentesPessoa = 0;
    let parcelasAtrasadasPessoa = 0;

    for (const row of rows) {
      if (isCanceled(row.statusPessoa)) continue;
      const valor = getParcelaReembolsoCents(row.numero) / 100;
      if (valor <= 0) continue;
      const abatidoSaldo = getParcelaCompraSaldoAbatido(saldoMovimentacoes, row.id);
      const pagoPorSaldo = Math.min(valor, abatidoSaldo);
      const pendentePorSaldo = round2(Math.max(0, valor - pagoPorSaldo));

      if (isPaid(row.statusPessoa)) {
        pagoPessoa += valor;
        continue;
      }

      if (isOutstanding(row.statusPessoa)) {
        pagoPessoa += pagoPorSaldo;
        pendentePessoa += pendentePorSaldo;
        if (pendentePorSaldo > 0) {
          parcelasPendentesPessoa += 1;
        }
        if (pendentePorSaldo > 0 && isOverdue(row.dataVencimento, todayIso)) {
          parcelasAtrasadasPessoa += 1;
        }
      }
    }

    return {
      pendentePessoa: round2(pendentePessoa),
      pagoPessoa: round2(pagoPessoa),
      parcelasPendentesPessoa,
      parcelasAtrasadasPessoa,
      compraAtrasada: parcelasAtrasadasPessoa > 0,
      usaParcelasReais: true,
    };
  }

  const totalParcelas = reembolso.totalParcelas;
  const parcelaAtual = reembolso.parcelaAtual;
  const statusPessoa = normalizeStatus(compra.statusPessoa);
  const statusPago = statusPessoa === "pago";
  const statusCancelado = statusPessoa === "cancelado";

  let parcelasAtrasadasPessoa = 0;
  let pendentePessoa = 0;
  if (!statusPago && !statusCancelado) {
    for (let numero = parcelaAtual; numero <= totalParcelas; numero += 1) {
      const valorParcela = getParcelaReembolsoCents(numero) / 100;
      if (valorParcela <= 0) continue;
      pendentePessoa += valorParcela;
      const dataVencimento = getFallbackInstallmentDueDate(compra.dataCompra, numero - 1);
      if (isOverdue(dataVencimento, todayIso)) {
        parcelasAtrasadasPessoa += 1;
      }
    }
  }

  const pendenteFinal = statusPago || statusCancelado ? 0 : round2(pendentePessoa);
  const pagoFinal = statusCancelado
    ? 0
    : round2(Math.max(0, reembolso.reembolsoPessoa - pendenteFinal));
  const parcelasPendentesFinal = statusPago || statusCancelado
    ? 0
    : reembolso.reembolsoPorParcelaCents
      .slice(parcelaAtual - 1)
      .filter((valor) => valor > 0).length;

  return {
    pendentePessoa: pendenteFinal,
    pagoPessoa: pagoFinal,
    parcelasPendentesPessoa: parcelasPendentesFinal,
    parcelasAtrasadasPessoa,
    compraAtrasada: parcelasAtrasadasPessoa > 0,
    usaParcelasReais: false,
  };
}

type PessoaResumoBatchData = {
  dividas: Divida[];
  comprasVinculadas: CompraCartao[];
  parcelasCompraByCompraId: Map<string, ParcelaCompra[]>;
  servicoPessoas: ServicoPessoa[];
  servicoPagamentosByServicoPessoaId: Map<string, ServicoPagamento[]>;
  saldoMovimentacoes: PessoaSaldoMovimentacao[];
};

type PessoaResumoComputado = {
  totais: PessoaResumo["totais"];
  alertas: PessoaResumo["alertas"];
  totalDeve: number;
  totalReceber: number;
  saldoAtual: number;
  servicosMesAtual: number;
  movimentacoes: number;
  proximosRecebimentos: number;
};

function computePessoaResumo({
  dividas,
  comprasVinculadas,
  parcelasCompraByCompraId,
  servicoPessoas,
  servicoPagamentosByServicoPessoaId,
  saldoMovimentacoes,
}: PessoaResumoBatchData): PessoaResumoComputado {
  const todayIso = format(new Date(), "yyyy-MM-dd");
  const mesReferencia = format(new Date(), "yyyy-MM");

  let comigoPendente = 0;
  let comigoPago = 0;
  let comigoVencidas = 0;
  let comigoQuantidadePendentes = 0;
  let euDevoPendente = 0;
  let euDevoPago = 0;
  let euDevoVencidas = 0;
  let euDevoQuantidadePendentes = 0;

  for (const divida of dividas) {
    const valor = toMoneyNumber(divida.valor);
    const pago = isPaid(divida.status);
    const vencida = !pago && isOverdue(divida.dataVencimento, todayIso);
    const isComigo = divida.tipo === "receber";

    if (isComigo) {
      if (pago) {
        comigoPago += valor;
      } else {
        comigoPendente += valor;
        comigoQuantidadePendentes += 1;
        if (vencida) comigoVencidas += 1;
      }
    } else if (pago) {
      euDevoPago += valor;
    } else {
      euDevoPendente += valor;
      euDevoQuantidadePendentes += 1;
      if (vencida) euDevoVencidas += 1;
    }
  }

  const comprasResumo = comprasVinculadas.map((compra) => {
    const parcelasCompra = parcelasCompraByCompraId.get(compra.id) ?? [];
    return summarizeCompraPessoa(compra, parcelasCompra, todayIso, saldoMovimentacoes);
  });

  const comprasPendentePessoa = round2(comprasResumo.reduce((sum, item) => sum + item.pendentePessoa, 0));
  const comprasPagoPessoa = round2(comprasResumo.reduce((sum, item) => sum + item.pagoPessoa, 0));
  const parcelasPendentesPessoa = comprasResumo.reduce((sum, item) => sum + item.parcelasPendentesPessoa, 0);
  const parcelasVencidasPessoa = comprasResumo.reduce((sum, item) => sum + item.parcelasAtrasadasPessoa, 0);
  const comprasAtrasadas = comprasResumo.filter((item) => item.compraAtrasada).length;
  const comprasComParcelasReais = comprasResumo.filter((item) => item.usaParcelasReais).length;
  const comprasEmFallbackLegado = comprasResumo.length - comprasComParcelasReais;

  let servicosPendentes = 0;
  let servicosPagos = 0;
  let servicosPendentesQuantidade = 0;

  for (const servicoPessoa of servicoPessoas) {
    const valorDevidoMes = toMoneyNumber(servicoPessoa.valorDevido);
    const pagamentosDoServico = servicoPagamentosByServicoPessoaId.get(servicoPessoa.id) ?? [];
    const contextoMes = getPagamentoServicoMesContexto(pagamentosDoServico, mesReferencia);
    const jaPagoNoMes = contextoMes !== null && normalizeStatus(contextoMes.status) === "pago";

    if (jaPagoNoMes) {
      servicosPagos += valorDevidoMes;
      continue;
    }

    const abatidoSaldoMes = getServicoMesSaldoAbatido(saldoMovimentacoes, servicoPessoa.id, mesReferencia);
    const pagoNoMes = Math.min(valorDevidoMes, abatidoSaldoMes);
    const pendenteNoMes = Math.max(0, valorDevidoMes - pagoNoMes);

    servicosPagos += pagoNoMes;
    servicosPendentes += pendenteNoMes;
    if (pendenteNoMes > 0) {
      servicosPendentesQuantidade += 1;
    }
  }

  const saldoPessoa = buildPessoaSaldoResumo(saldoMovimentacoes);
  const consolidadoPendente = round2(
    comigoPendente
      + euDevoPendente
      + comprasPendentePessoa
      + servicosPendentes,
  );

  const totais: PessoaResumo["totais"] = {
    dividas: {
      comigo: {
        pendente: round2(comigoPendente),
        pago: round2(comigoPago),
        vencidas: comigoVencidas,
        quantidadePendentes: comigoQuantidadePendentes,
      },
      euDevo: {
        pendente: round2(euDevoPendente),
        pago: round2(euDevoPago),
        vencidas: euDevoVencidas,
        quantidadePendentes: euDevoQuantidadePendentes,
      },
      pagueiDoMeuBolso: {
        pendente: comprasPendentePessoa,
        pago: comprasPagoPessoa,
        parcelasPendentes: parcelasPendentesPessoa,
      },
    },
    comprasVinculadas: {
      pendentePessoa: comprasPendentePessoa,
      pagoPessoa: comprasPagoPessoa,
      parcelasPendentesPessoa,
      comprasComParcelasReais,
      comprasEmFallbackLegado,
    },
    servicosMesAtual: {
      escopo: "mes_atual",
      mesReferencia,
      pendente: round2(servicosPendentes),
      pago: round2(servicosPagos),
      pendentesQuantidade: servicosPendentesQuantidade,
      totalVinculos: servicoPessoas.length,
    },
    saldoPessoa,
    consolidadoPendente,
  };

  const alertas: PessoaResumo["alertas"] = {
    comprasAtrasadas,
    parcelasVencidasPessoa,
    servicosPendentes: servicosPendentesQuantidade,
    parcelasPendentesPessoa,
  };

  const proximosRecebimentos = dividas.filter((divida) => (
    divida.tipo === "receber"
      && isOutstanding(divida.status)
      && !isOverdue(divida.dataVencimento, todayIso)
  )).length;

  return {
    totais,
    alertas,
    totalDeve: round2(euDevoPendente + comprasPendentePessoa + servicosPendentes),
    totalReceber: round2(comigoPendente),
    saldoAtual: saldoPessoa.saldoAtual,
    servicosMesAtual: round2(servicosPendentes),
    movimentacoes: saldoPessoa.movimentacoes,
    proximosRecebimentos,
  };
}

type OrphanBucket = {
  sourcePessoaId: string;
  dividas: Divida[];
  compras: CompraCartao[];
  servicoPessoas: ServicoPessoa[];
};

export class PessoasService {
  constructor(private readonly storage: IStorage) {}

  private async collectOrphanBuckets(userId: string) {
    const [pessoasAtivas, pessoasRemovidas, dividas, compras, servicoPessoas] = await Promise.all([
      this.storage.getPessoasByStatus(userId, "active"),
      this.storage.getPessoasByStatus(userId, "removed"),
      this.storage.getDividas(userId),
      this.storage.getComprasCartao(userId),
      this.storage.getServicoPessoas(userId),
    ]);

    const pessoasSet = new Set<string>([
      ...pessoasAtivas.map((pessoa) => pessoa.id),
      ...pessoasRemovidas.map((pessoa) => pessoa.id),
    ]);

    const buckets = new Map<string, OrphanBucket>();
    const ensureBucket = (sourcePessoaId: string) => {
      const existing = buckets.get(sourcePessoaId);
      if (existing) return existing;
      const created: OrphanBucket = { sourcePessoaId, dividas: [], compras: [], servicoPessoas: [] };
      buckets.set(sourcePessoaId, created);
      return created;
    };

    for (const divida of dividas) {
      const sourcePessoaId = normalizeOptionalText(divida.pessoaId);
      if (!sourcePessoaId || pessoasSet.has(sourcePessoaId)) continue;
      ensureBucket(sourcePessoaId).dividas.push(divida);
    }

    for (const compra of compras) {
      const sourcePessoaId = normalizeOptionalText(compra.pessoaId);
      if (!sourcePessoaId || pessoasSet.has(sourcePessoaId)) continue;
      ensureBucket(sourcePessoaId).compras.push(compra);
    }

    for (const servicoPessoa of servicoPessoas) {
      const sourcePessoaId = normalizeOptionalText(servicoPessoa.pessoaId);
      if (!sourcePessoaId || pessoasSet.has(sourcePessoaId)) continue;
      ensureBucket(sourcePessoaId).servicoPessoas.push(servicoPessoa);
    }

    return buckets;
  }

  async list(userId: string, status: PessoaListStatus = "active") {
    return this.storage.getPessoasByStatus(userId, status);
  }

  async listSaldoMovimentacoesByUser(userId: string): Promise<PessoaSaldoMovimentacao[]> {
    const rows = await this.storage.getPessoaSaldoMovimentacoes(userId);
    return [...rows].sort((a, b) => compareSaldoMovimentacoesAsc(b, a));
  }

  async listSaldoMovimentacoes(
    pessoaId: string,
    userId: string,
  ): Promise<PessoaSaldoMovimentacoesResponse | null> {
    const pessoa = await this.storage.getPessoa(pessoaId, userId);
    if (!pessoa) return null;

    const rows = await this.storage.getPessoaSaldoMovimentacoesByPessoa(pessoaId, userId);
    return {
      pessoa,
      resumo: buildPessoaSaldoResumo(rows),
      movimentacoes: buildPessoaSaldoMovimentacoes(rows),
    };
  }

  async getResumo(pessoaId: string, userId: string): Promise<PessoaResumo | null> {
    const pessoa = await this.storage.getPessoa(pessoaId, userId);
    if (!pessoa) return null;

    const [dividas, comprasVinculadas, parcelasCompra, servicoPessoas, servicoPagamentos, saldoMovimentacoes] = await Promise.all([
      this.storage.getDividasByPessoa(pessoaId, userId),
      this.storage.getComprasByPessoa(pessoaId, userId),
      this.storage.getParcelasCompraByUser(userId),
      this.storage.getServicoPessoasByPessoa(pessoaId, userId),
      this.storage.getServicoPagamentos(userId),
      this.storage.getPessoaSaldoMovimentacoesByPessoa(pessoaId, userId),
    ]);

    const parcelasCompraByCompraId = new Map<string, ParcelaCompra[]>();
    for (const parcela of parcelasCompra) {
      const rows = parcelasCompraByCompraId.get(parcela.compraCartaoId) ?? [];
      rows.push(parcela);
      parcelasCompraByCompraId.set(parcela.compraCartaoId, rows);
    }

    const servicoPagamentosByServicoPessoaId = new Map<string, ServicoPagamento[]>();
    for (const pagamento of servicoPagamentos) {
      const rows = servicoPagamentosByServicoPessoaId.get(pagamento.servicoPessoaId) ?? [];
      rows.push(pagamento);
      servicoPagamentosByServicoPessoaId.set(pagamento.servicoPessoaId, rows);
    }

    const resumo = computePessoaResumo({
      dividas,
      comprasVinculadas,
      parcelasCompraByCompraId,
      servicoPessoas,
      servicoPagamentosByServicoPessoaId,
      saldoMovimentacoes,
    });

    return {
      pessoa,
      totais: resumo.totais,
      alertas: resumo.alertas,
    };
  }

  async create(userId: string, data: PessoaBodyInput) {
    return this.storage.createPessoa({ ...data, userId });
  }

  async update(id: string, userId: string, data: PessoaUpdateBodyInput) {
    return this.storage.updatePessoa(id, userId, data);
  }

  async delete(id: string, userId: string) {
    return this.storage.deletePessoa(id, userId);
  }

  async restore(id: string, userId: string) {
    return this.storage.restorePessoa(id, userId);
  }

  async deletePermanent(id: string, userId: string): Promise<DeletePessoaPermanentResult> {
    const pessoa = await this.storage.getPessoa(id, userId);
    if (!pessoa) return { error: "NOT_FOUND" };
    if (!pessoa.deletedAt) return { error: "PESSOA_ATIVA" };

    const [dividas, compras, servicoPessoas, saldoMovimentacoes] = await Promise.all([
      this.storage.getDividasByStatus(userId, "all"),
      this.storage.getComprasByPessoa(id, userId),
      this.storage.getServicoPessoasByPessoa(id, userId),
      this.storage.getPessoaSaldoMovimentacoesByPessoa(id, userId),
    ]);

    const dividasVinculadas = dividas.filter((divida) => divida.pessoaId === id);
    if (dividasVinculadas.length > 0 || compras.length > 0 || servicoPessoas.length > 0 || saldoMovimentacoes.length > 0) {
      return { error: "PESSOA_COM_VINCULOS" };
    }

    const deleted = await this.storage.deletePessoaPermanent(id, userId);
    if (!deleted) return { error: "NOT_FOUND" };
    return { ok: true };
  }

  async listOrphanLinks(userId: string): Promise<PessoaOrphanLinksGroup[]> {
    const buckets = await this.collectOrphanBuckets(userId);
    const groups: PessoaOrphanLinksGroup[] = [];

    for (const bucket of Array.from(buckets.values())) {
      const totalAReceber = round2(bucket.dividas.reduce((sum: number, divida: Divida) => (
        sum + (divida.tipo === "receber" && isOutstandingStatus(divida.status) ? toMoneyNumber(divida.valor) : 0)
      ), 0));

      const totalAPagar = round2(bucket.dividas.reduce((sum: number, divida: Divida) => (
        sum + (divida.tipo === "pagar" && isOutstandingStatus(divida.status) ? toMoneyNumber(divida.valor) : 0)
      ), 0));

      groups.push({
        orphanGroupKey: buildOrphanGroupKey(bucket.sourcePessoaId),
        nomeSugerido: `Pessoa removida (${bucket.sourcePessoaId.slice(0, 8)})`,
        sourcePessoaId: bucket.sourcePessoaId,
        dividasCount: bucket.dividas.length,
        linkedServicosCount: bucket.servicoPessoas.length,
        linkedComprasCount: bucket.compras.length,
        totalAReceber,
        totalAPagar,
        exemplos: bucket.dividas.slice(0, 3).map((divida: Divida) => ({
          dividaId: divida.id,
          descricao: normalizeOptionalText(divida.descricao),
          tipo: divida.tipo,
          valor: String(divida.valor),
          status: String(divida.status),
        })),
      });
    }

    return groups.sort((a, b) => {
      const totalA = a.totalAReceber + a.totalAPagar;
      const totalB = b.totalAReceber + b.totalAPagar;
      if (totalB !== totalA) return totalB - totalA;
      return a.nomeSugerido.localeCompare(b.nomeSugerido, "pt-BR");
    });
  }

  async recoverOrphanLinks(
    userId: string,
    data: PessoaRecoverOrphanLinksBodyInput,
  ): Promise<RecoverOrphanLinksResult> {
    const sourcePessoaId = parseOrphanGroupKey(data.orphanGroupKey);
    if (!sourcePessoaId) return { error: "ORPHAN_GROUP_KEY_INVALID" };

    const buckets = await this.collectOrphanBuckets(userId);
    const bucket = buckets.get(sourcePessoaId);
    const hasOrphanLinks = Boolean(bucket) && (
      (bucket?.dividas.length ?? 0)
      + (bucket?.compras.length ?? 0)
      + (bucket?.servicoPessoas.length ?? 0)
    ) > 0;

    const requestedPessoaId = normalizeOptionalText(data.pessoaIdExistente);
    let targetPessoa: Pessoa | undefined;
    let createdPessoa = false;

    if (requestedPessoaId) {
      targetPessoa = await this.storage.getPessoa(requestedPessoaId, userId);
      if (!targetPessoa) return { error: "TARGET_PESSOA_NOT_FOUND" };
      if (targetPessoa.deletedAt) return { error: "TARGET_PESSOA_REMOVED" };

      if (!hasOrphanLinks) {
        return {
          pessoaId: targetPessoa.id,
          createdPessoa: false,
          linkedDividasCount: 0,
          linkedServicosCount: 0,
          linkedComprasCount: 0,
        };
      }
    } else {
      if (!hasOrphanLinks) return { error: "ORPHAN_GROUP_NOT_FOUND" };

      const nome = normalizeOptionalText(data.nome);
      if (!nome) return { error: "NOME_REQUIRED" };

      const pessoasAtivas = await this.storage.getPessoasByStatus(userId, "active");
      targetPessoa = pessoasAtivas.find((pessoa) => normalizePersonName(pessoa.nome) === normalizePersonName(nome));

      if (!targetPessoa) {
        const totalAReceber = bucket?.dividas.reduce((sum, divida) => (
          sum + (divida.tipo === "receber" && isOutstandingStatus(divida.status) ? toMoneyNumber(divida.valor) : 0)
        ), 0) ?? 0;

        const totalAPagar = bucket?.dividas.reduce((sum, divida) => (
          sum + (divida.tipo === "pagar" && isOutstandingStatus(divida.status) ? toMoneyNumber(divida.valor) : 0)
        ), 0) ?? 0;

        const tipo: PessoaBodyInput["tipo"] = totalAPagar > totalAReceber ? "eu_devo" : "me_deve";
        targetPessoa = await this.storage.createPessoa({
          userId,
          nome,
          tipo,
          telefone: null,
          observacao: null,
        });
        createdPessoa = true;
      }
    }

    if (!targetPessoa) return { error: "TARGET_PESSOA_NOT_FOUND" };
    if (!hasOrphanLinks || !bucket) {
      return {
        pessoaId: targetPessoa.id,
        createdPessoa,
        linkedDividasCount: 0,
        linkedServicosCount: 0,
        linkedComprasCount: 0,
      };
    }

    let linkedDividasCount = 0;
    let linkedServicosCount = 0;
    let linkedComprasCount = 0;

    for (const divida of bucket.dividas) {
      const updated = await this.storage.updateDivida(divida.id, userId, { pessoaId: targetPessoa.id });
      if (updated) linkedDividasCount += 1;
    }

    for (const compra of bucket.compras) {
      const updated = await this.storage.updateCompraCartao(compra.id, userId, { pessoaId: targetPessoa.id });
      if (updated) linkedComprasCount += 1;
    }

    for (const servicoPessoa of bucket.servicoPessoas) {
      const updated = await this.storage.updateServicoPessoa(servicoPessoa.id, userId, { pessoaId: targetPessoa.id });
      if (updated) linkedServicosCount += 1;
    }

    return {
      pessoaId: targetPessoa.id,
      createdPessoa,
      linkedDividasCount,
      linkedServicosCount,
      linkedComprasCount,
    };
  }
}
