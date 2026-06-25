import { format } from "date-fns";
import type { IStorage } from "../storage";
import type {
  ServicoBodyInput,
  ServicoCobrancaPagamentoBodyInput,
  ServicoCobrancaPagamentoCancelBodyInput,
  ServicoPagamentoBodyInput,
  ServicoPessoaBodyInput,
  ServicoPessoaUpdateBodyInput,
  ServicoUpdateBodyInput,
} from "../validators/core-domain.validators";
import {
  calculateServicoChargePaidAmountForCompetency,
  calculateServicoRealMonthlyExpenseAmount,
  resolveServicoBillingFields,
} from "@shared/servico-periodicidade";
import { parseMoney } from "../../utils/money";

type UpdateServicoPessoaResult =
  | { error: "SERVICO_NOT_FOUND" }
  | { error: "PESSOA_NOT_FOUND" }
  | { updated: Awaited<ReturnType<IStorage["updateServicoPessoa"]>> };

type CreateServicoResult =
  | { error: "COMPRA_NOT_FOUND" }
  | { error: "CARTAO_NOT_FOUND" }
  | { created: Awaited<ReturnType<IStorage["createServico"]>> };

type UpdateServicoResult =
  | { error: "COMPRA_NOT_FOUND" }
  | { error: "CARTAO_NOT_FOUND" }
  | { updated: Awaited<ReturnType<IStorage["updateServico"]>> };

type ServicoCardFieldsResult =
  | { error: "COMPRA_NOT_FOUND" }
  | { error: "CARTAO_NOT_FOUND" }
  | {
    compraCartaoId: string | null;
    cartaoId: string | null;
    projetarNaFaturaCartao: boolean;
  };

type CreateServicoPessoaResult =
  | { error: "SERVICO_NOT_FOUND" }
  | { error: "PESSOA_NOT_FOUND" }
  | { created: Awaited<ReturnType<IStorage["createServicoPessoa"]>> };

type CreateServicoPagamentoResult =
  | { error: "SERVICO_PESSOA_NOT_FOUND" }
  | { created: Awaited<ReturnType<IStorage["createServicoPagamento"]>> };

type CreateServicoCobrancaPagamentoResult =
  | { error: "SERVICO_NOT_FOUND" }
  | { error: "SERVICO_SEM_COBRANCA_NA_COMPETENCIA" }
  | { error: "VALOR_ACIMA_DO_PENDENTE"; remainingAmount: number }
  | { created: Awaited<ReturnType<IStorage["createServicoCobrancaPagamento"]>> };

type CancelServicoCobrancaPagamentoResult =
  | { error: "SERVICO_NOT_FOUND" }
  | { error: "PAGAMENTO_NOT_FOUND" }
  | { updated: Awaited<ReturnType<IStorage["updateServicoCobrancaPagamento"]>> };

function parseMonthReferenceParts(monthReference: string): { competenciaAno: number; competenciaMes: number } | null {
  const match = monthReference.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const competenciaAno = Number(match[1]);
  const competenciaMes = Number(match[2]);
  if (!Number.isInteger(competenciaAno) || !Number.isInteger(competenciaMes) || competenciaMes < 1 || competenciaMes > 12) {
    return null;
  }
  return { competenciaAno, competenciaMes };
}

export class ServicosService {
  constructor(private readonly storage: IStorage) {}

  private async validateCompraCartaoOwnership(compraCartaoId: string | null | undefined, userId: string) {
    if (!compraCartaoId) return { ok: true as const };
    const compra = await this.storage.getCompraCartao(compraCartaoId, userId);
    if (!compra) return { ok: false as const };
    return { ok: true as const, compra };
  }

  private async validateCartaoOwnership(cartaoId: string | null | undefined, userId: string) {
    if (!cartaoId) return { ok: true as const };
    const cartao = await this.storage.getCartao(cartaoId, userId);
    if (!cartao) return { ok: false as const };
    return { ok: true as const, cartao };
  }

  private shouldNormalizeServicoBilling(data: Partial<ServicoBodyInput> | Partial<ServicoUpdateBodyInput>): boolean {
    return Object.prototype.hasOwnProperty.call(data, "valorMensal")
      || Object.prototype.hasOwnProperty.call(data, "valorCobranca")
      || Object.prototype.hasOwnProperty.call(data, "periodicidadeCobranca")
      || Object.prototype.hasOwnProperty.call(data, "mesCobranca");
  }

  private async resolveServicoCardFields(
    userId: string,
    data: Partial<ServicoBodyInput> | Partial<ServicoUpdateBodyInput>,
    current?: { formaPagamento?: string | null; cartaoId?: string | null; compraCartaoId?: string | null; projetarNaFaturaCartao?: boolean | null },
  ): Promise<ServicoCardFieldsResult> {
    const compraCartaoId = Object.prototype.hasOwnProperty.call(data, "compraCartaoId")
      ? (data.compraCartaoId ?? null)
      : (current?.compraCartaoId ?? null);
    const compraValidation = await this.validateCompraCartaoOwnership(compraCartaoId, userId);
    if (!compraValidation.ok) return { error: "COMPRA_NOT_FOUND" as const };

    const requestedCartaoId = Object.prototype.hasOwnProperty.call(data, "cartaoId")
      ? (data.cartaoId ?? null)
      : (current?.cartaoId ?? null);
    const resolvedCartaoId = compraValidation.compra?.cartaoId ?? requestedCartaoId ?? null;
    const cartaoValidation = await this.validateCartaoOwnership(resolvedCartaoId, userId);
    if (!cartaoValidation.ok) return { error: "CARTAO_NOT_FOUND" as const };

    const formaPagamento = String(
      Object.prototype.hasOwnProperty.call(data, "formaPagamento")
        ? (data.formaPagamento ?? "")
        : (current?.formaPagamento ?? ""),
    ).trim().toLowerCase();
    const projectFlag = Object.prototype.hasOwnProperty.call(data, "projetarNaFaturaCartao")
      ? (data.projetarNaFaturaCartao === true)
      : (current?.projetarNaFaturaCartao === true);

    return {
      compraCartaoId,
      cartaoId: resolvedCartaoId,
      projetarNaFaturaCartao: formaPagamento === "cartao" && projectFlag && Boolean(resolvedCartaoId),
    };
  }

  async listServicos(userId: string) {
    return this.storage.getServicos(userId);
  }

  async createServico(userId: string, data: ServicoBodyInput): Promise<CreateServicoResult> {
    const cardFields = await this.resolveServicoCardFields(userId, data);
    if ("error" in cardFields) return cardFields;

    const billing = resolveServicoBillingFields(data);
    const created = await this.storage.createServico({
      ...data,
      userId,
      valorMensal: billing.valorMensal,
      valorCobranca: billing.valorCobranca,
      periodicidadeCobranca: billing.periodicidadeCobranca,
      mesCobranca: billing.mesCobranca,
      compraCartaoId: cardFields.compraCartaoId,
      cartaoId: cardFields.cartaoId,
      projetarNaFaturaCartao: cardFields.projetarNaFaturaCartao,
    });
    return { created };
  }

  async updateServico(id: string, userId: string, data: ServicoUpdateBodyInput): Promise<UpdateServicoResult> {
    const current = await this.storage.getServico(id, userId);
    if (!current) return { updated: undefined };

    const cardFields = await this.resolveServicoCardFields(userId, data, current);
    if ("error" in cardFields) return cardFields;

    if (!this.shouldNormalizeServicoBilling(data)) {
      const updated = await this.storage.updateServico(id, userId, {
        ...data,
        compraCartaoId: cardFields.compraCartaoId,
        cartaoId: cardFields.cartaoId,
        projetarNaFaturaCartao: cardFields.projetarNaFaturaCartao,
      });
      return { updated };
    }

    const billing = resolveServicoBillingFields(data, current);
    const updated = await this.storage.updateServico(id, userId, {
      ...data,
      valorMensal: billing.valorMensal,
      valorCobranca: billing.valorCobranca,
      periodicidadeCobranca: billing.periodicidadeCobranca,
      mesCobranca: billing.mesCobranca,
      compraCartaoId: cardFields.compraCartaoId,
      cartaoId: cardFields.cartaoId,
      projetarNaFaturaCartao: cardFields.projetarNaFaturaCartao,
    });
    return { updated };
  }

  async deleteServico(id: string, userId: string) {
    return this.storage.deleteServico(id, userId);
  }

  async listServicoPessoas(userId: string) {
    return this.storage.getServicoPessoas(userId);
  }

  async createServicoPessoa(userId: string, data: ServicoPessoaBodyInput): Promise<CreateServicoPessoaResult> {
    const servico = await this.storage.getServico(data.servicoId, userId);
    if (!servico) return { error: "SERVICO_NOT_FOUND" };

    const pessoa = await this.storage.getPessoa(data.pessoaId, userId);
    if (!pessoa) return { error: "PESSOA_NOT_FOUND" };

    const created = await this.storage.createServicoPessoa({ ...data, userId });
    return { created };
  }

  async updateServicoPessoa(id: string, userId: string, data: ServicoPessoaUpdateBodyInput): Promise<UpdateServicoPessoaResult> {
    if (data.servicoId) {
      const servico = await this.storage.getServico(data.servicoId, userId);
      if (!servico) return { error: "SERVICO_NOT_FOUND" };
    }
    if (data.pessoaId) {
      const pessoa = await this.storage.getPessoa(data.pessoaId, userId);
      if (!pessoa) return { error: "PESSOA_NOT_FOUND" };
    }

    const updated = await this.storage.updateServicoPessoa(id, userId, data);
    return { updated };
  }

  async deleteServicoPessoa(id: string, userId: string) {
    await this.storage.deleteServicoPagamentosByServicoPessoa(id, userId);
    return this.storage.deleteServicoPessoa(id, userId);
  }

  async listServicoPagamentos(userId: string) {
    return this.storage.getServicoPagamentos(userId);
  }

  async createServicoPagamento(userId: string, data: ServicoPagamentoBodyInput): Promise<CreateServicoPagamentoResult> {
    const servicoPessoas = await this.storage.getServicoPessoas(userId);
    const belongsToUser = servicoPessoas.some((item) => item.id === data.servicoPessoaId);
    if (!belongsToUser) return { error: "SERVICO_PESSOA_NOT_FOUND" };

    const created = await this.storage.createServicoPagamento({ ...data, userId });
    return { created };
  }

  async deleteServicoPagamento(id: string, userId: string) {
    return this.storage.deleteServicoPagamento(id, userId);
  }

  async listServicoCobrancaPagamentos(userId: string) {
    const rows = await this.storage.getServicoCobrancaPagamentos(userId);
    return [...rows].sort(
      (left, right) =>
        String(right.dataPagamento ?? "").localeCompare(String(left.dataPagamento ?? ""))
        || String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")),
    );
  }

  async createServicoCobrancaPagamento(
    userId: string,
    servicoId: string,
    data: ServicoCobrancaPagamentoBodyInput,
  ): Promise<CreateServicoCobrancaPagamentoResult> {
    const servico = await this.storage.getServico(servicoId, userId);
    if (!servico) return { error: "SERVICO_NOT_FOUND" };

    const monthParts = parseMonthReferenceParts(data.monthReference);
    if (!monthParts) {
      return { error: "SERVICO_SEM_COBRANCA_NA_COMPETENCIA" };
    }

    const chargeAmount = servico.status === "ativo"
      ? calculateServicoRealMonthlyExpenseAmount(servico, data.monthReference)
      : 0;
    if (chargeAmount <= 0) {
      return { error: "SERVICO_SEM_COBRANCA_NA_COMPETENCIA" };
    }

    const existingPayments = await this.storage.getServicoCobrancaPagamentosByServico(servicoId, userId);
    const paidAmount = calculateServicoChargePaidAmountForCompetency(servicoId, data.monthReference, existingPayments);
    const remainingAmount = Math.max(0, Math.round((chargeAmount - paidAmount) * 100) / 100);
    if (remainingAmount <= 0) {
      const latestActive = [...existingPayments]
        .filter((payment) => !payment.canceladoEm)
        .filter((payment) => `${payment.competenciaAno}-${String(payment.competenciaMes).padStart(2, "0")}` === data.monthReference)
        .sort((left, right) => String(right.createdAt ?? "").localeCompare(String(left.createdAt ?? "")))[0];
      if (latestActive) return { created: latestActive };
      return { error: "SERVICO_SEM_COBRANCA_NA_COMPETENCIA" };
    }

    const requestedAmount = parseMoney(data.valorPago) ?? 0;
    if (requestedAmount <= 0) {
      return { error: "VALOR_ACIMA_DO_PENDENTE", remainingAmount };
    }
    if (requestedAmount > remainingAmount + 0.0001) {
      return { error: "VALOR_ACIMA_DO_PENDENTE", remainingAmount };
    }

    const created = await this.storage.createServicoCobrancaPagamento({
      userId,
      servicoId,
      competenciaAno: monthParts.competenciaAno,
      competenciaMes: monthParts.competenciaMes,
      valorPago: data.valorPago,
      dataPagamento: data.dataPagamento ?? format(new Date(), "yyyy-MM-dd"),
      observacao: data.observacao ?? null,
      canceladoEm: null,
      motivoCancelamento: null,
    });

    return { created };
  }

  async cancelServicoCobrancaPagamento(
    userId: string,
    servicoId: string,
    paymentId: string,
    data: ServicoCobrancaPagamentoCancelBodyInput,
  ): Promise<CancelServicoCobrancaPagamentoResult> {
    const servico = await this.storage.getServico(servicoId, userId);
    if (!servico) return { error: "SERVICO_NOT_FOUND" };

    const existingPayments = await this.storage.getServicoCobrancaPagamentosByServico(servicoId, userId);
    const payment = existingPayments.find((item) => item.id === paymentId);
    if (!payment) return { error: "PAGAMENTO_NOT_FOUND" };
    if (payment.canceladoEm) {
      return { updated: payment };
    }

    const updated = await this.storage.updateServicoCobrancaPagamento(paymentId, userId, {
      canceladoEm: new Date(),
      motivoCancelamento: data.motivoCancelamento ?? null,
    });
    return { updated };
  }
}
