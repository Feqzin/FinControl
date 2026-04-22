import { addMonths, format, parseISO } from "date-fns";
import type { CompraCartao, Pessoa } from "../../shared/schema.js";
import { parseMoney } from "../../utils/money.js";
import type { IStorage } from "../storage.js";
import type { PessoaBodyInput, PessoaUpdateBodyInput } from "../validators/core-domain.validators.js";

type MoneyValue = string | number | null | undefined;

type PessoaResumoDividaBloco = {
  pendente: number;
  pago: number;
  vencidas: number;
  quantidadePendentes: number;
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
    consolidadoPendente: number;
  };
  alertas: {
    comprasAtrasadas: number;
    servicosPendentes: number;
    parcelasPendentesPessoa: number;
  };
};

function toMoneyNumber(value: MoneyValue): number {
  return parseMoney(value) ?? 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toLowerCase();
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

function normalizeInstallmentCount(value: number | null | undefined): number {
  const parsed = Number(value ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.trunc(parsed));
}

function normalizeCurrentInstallment(current: number | null | undefined, total: number): number {
  const parsed = Number(current ?? 1);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(total, Math.trunc(parsed)));
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
  usaParcelasReais: boolean;
};

async function summarizeCompraPessoa(
  storage: IStorage,
  compra: CompraCartao,
  userId: string,
  todayIso: string,
): Promise<CompraResumo> {
  const rows = await storage.getParcelasCompra(compra.id, userId);
  if (rows.length > 0) {
    let pendentePessoa = 0;
    let pagoPessoa = 0;
    let parcelasPendentesPessoa = 0;
    let parcelasAtrasadasPessoa = 0;

    for (const row of rows) {
      if (isCanceled(row.statusPessoa)) continue;
      const valor = toMoneyNumber(row.valor);
      if (isPaid(row.statusPessoa)) {
        pagoPessoa += valor;
        continue;
      }

      if (isOutstanding(row.statusPessoa)) {
        pendentePessoa += valor;
        parcelasPendentesPessoa += 1;
        if (isOverdue(row.dataVencimento, todayIso)) {
          parcelasAtrasadasPessoa += 1;
        }
      }
    }

    return {
      pendentePessoa,
      pagoPessoa,
      parcelasPendentesPessoa,
      parcelasAtrasadasPessoa,
      usaParcelasReais: true,
    };
  }

  const totalParcelas = normalizeInstallmentCount(compra.parcelas);
  const parcelaAtual = normalizeCurrentInstallment(compra.parcelaAtual, totalParcelas);
  const valorParcela = toMoneyNumber(compra.valorParcela);
  const statusPessoa = normalizeStatus(compra.statusPessoa);
  const statusPago = statusPessoa === "pago";
  const statusCancelado = statusPessoa === "cancelado";
  const parcelasPendentesPessoa = statusPago || statusCancelado ? 0 : Math.max(0, totalParcelas - parcelaAtual + 1);
  const parcelasPagasPessoa = statusPago ? totalParcelas : Math.max(0, parcelaAtual - 1);

  let parcelasAtrasadasPessoa = 0;
  if (parcelasPendentesPessoa > 0) {
    for (let numero = parcelaAtual; numero <= totalParcelas; numero += 1) {
      const dataVencimento = getFallbackInstallmentDueDate(compra.dataCompra, numero - 1);
      if (isOverdue(dataVencimento, todayIso)) {
        parcelasAtrasadasPessoa += 1;
      }
    }
  }

  return {
    pendentePessoa: round2(parcelasPendentesPessoa * valorParcela),
    pagoPessoa: round2(parcelasPagasPessoa * valorParcela),
    parcelasPendentesPessoa,
    parcelasAtrasadasPessoa,
    usaParcelasReais: false,
  };
}

export class PessoasService {
  constructor(private readonly storage: IStorage) {}

  async list(userId: string) {
    return this.storage.getPessoas(userId);
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

  async getResumo(pessoaId: string, userId: string): Promise<PessoaResumo | null> {
    const pessoa = await this.storage.getPessoa(pessoaId, userId);
    if (!pessoa) return null;

    const todayIso = format(new Date(), "yyyy-MM-dd");
    const mesReferencia = format(new Date(), "yyyy-MM");

    const [dividas, comprasVinculadas, servicoPessoas, servicoPagamentos] = await Promise.all([
      this.storage.getDividasByPessoa(pessoaId, userId),
      this.storage.getComprasByPessoa(pessoaId, userId),
      this.storage.getServicoPessoasByPessoa(pessoaId, userId),
      this.storage.getServicoPagamentos(userId),
    ]);

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

    const comprasResumo = await Promise.all(
      comprasVinculadas.map((compra) => summarizeCompraPessoa(this.storage, compra, userId, todayIso)),
    );

    const comprasPendentePessoa = round2(
      comprasResumo.reduce((sum, item) => sum + item.pendentePessoa, 0),
    );
    const comprasPagoPessoa = round2(
      comprasResumo.reduce((sum, item) => sum + item.pagoPessoa, 0),
    );
    const parcelasPendentesPessoa = comprasResumo.reduce((sum, item) => sum + item.parcelasPendentesPessoa, 0);
    const comprasAtrasadas = comprasResumo.reduce((sum, item) => sum + item.parcelasAtrasadasPessoa, 0);
    const comprasComParcelasReais = comprasResumo.filter((item) => item.usaParcelasReais).length;
    const comprasEmFallbackLegado = comprasResumo.length - comprasComParcelasReais;

    const servicoPessoaIds = new Set(servicoPessoas.map((sp) => sp.id));
    const pagamentosMesAtual = new Set(
      servicoPagamentos
        .filter((pagamento) => pagamento.mes === mesReferencia && servicoPessoaIds.has(pagamento.servicoPessoaId))
        .map((pagamento) => pagamento.servicoPessoaId),
    );

    let servicosPendentes = 0;
    let servicosPagos = 0;
    let servicosPendentesQuantidade = 0;

    for (const servicoPessoa of servicoPessoas) {
      const valor = toMoneyNumber(servicoPessoa.valorDevido);
      if (pagamentosMesAtual.has(servicoPessoa.id)) {
        servicosPagos += valor;
      } else {
        servicosPendentes += valor;
        servicosPendentesQuantidade += 1;
      }
    }

    const consolidadoPendente = round2(
      comigoPendente
      + euDevoPendente
      + comprasPendentePessoa
      + servicosPendentes,
    );

    return {
      pessoa,
      totais: {
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
        consolidadoPendente,
      },
      alertas: {
        comprasAtrasadas,
        servicosPendentes: servicosPendentesQuantidade,
        parcelasPendentesPessoa,
      },
    };
  }
}
