import type {
  CartaoFaturaPagamento,
  CartaoFaturaPagamentoAlocacao,
} from "../../shared/schema.js";
import { attachCardInvoicePaymentAllocations } from "../../shared/card-invoice-payments.js";
import type { FinancialRepository } from "../repositories/financial.repository.js";

export type DetailedCartaoFaturaPagamento = CartaoFaturaPagamento & {
  alocacoes: CartaoFaturaPagamentoAlocacao[];
};

type PaymentRepositoryLike = Pick<
  FinancialRepository,
  "getCartaoFaturaPagamentos" | "getCartaoFaturaPagamentosByCartao" | "getCartaoFaturaPagamentoAlocacoesByPagamentoIds"
>;

async function attachAllocations(
  repository: PaymentRepositoryLike,
  userId: string,
  pagamentos: CartaoFaturaPagamento[],
): Promise<DetailedCartaoFaturaPagamento[]> {
  if (pagamentos.length === 0) return [];
  const alocacoes = await repository.getCartaoFaturaPagamentoAlocacoesByPagamentoIds(
    pagamentos.map((pagamento) => pagamento.id),
    userId,
  );
  return attachCardInvoicePaymentAllocations(
    pagamentos,
    alocacoes,
  ) as DetailedCartaoFaturaPagamento[];
}

export async function loadInvoicePaymentsWithAllocations(
  repository: PaymentRepositoryLike,
  userId: string,
  options?: { cartaoId?: string },
): Promise<DetailedCartaoFaturaPagamento[]> {
  const pagamentos = options?.cartaoId
    ? await repository.getCartaoFaturaPagamentosByCartao(options.cartaoId, userId)
    : await repository.getCartaoFaturaPagamentos(userId);

  return attachAllocations(repository, userId, pagamentos);
}

export async function reloadInvoicePaymentsWithAllocations(
  repository: PaymentRepositoryLike,
  userId: string,
  pagamentos: CartaoFaturaPagamento[],
): Promise<DetailedCartaoFaturaPagamento[]> {
  return attachAllocations(repository, userId, pagamentos);
}
