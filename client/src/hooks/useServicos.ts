import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  Cartao,
  CompraCartao,
  ParcelaCompra,
  Pessoa,
  PessoaSaldoMovimentacao,
  Servico,
  ServicoCobrancaPagamento,
  ServicoPagamento,
  ServicoPessoa,
} from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { invalidateFinancialQueries } from "@/lib/financial-query-invalidation";
import {
  createServico,
  deleteServico,
  fetchServicoCobrancaPagamentos,
  toggleServicoStatus,
  updateServico,
  type ServicoPayload,
} from "@/services/api/servicos";

export function useServicos({ loadDivisionData = true }: { loadDivisionData?: boolean } = {}) {
  const { data: servicos = [], isLoading } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: servicoPessoas = [] } = useQuery<ServicoPessoa[]>({ queryKey: ["/api/servico-pessoas"] });
  const { data: servicoPagamentos = [] } = useQuery<ServicoPagamento[]>({ queryKey: ["/api/servico-pagamentos"] });
  const { data: servicoCobrancaPagamentos = [] } = useQuery<ServicoCobrancaPagamento[]>({
    queryKey: ["/api/servicos/cobranca-pagamentos"],
    queryFn: fetchServicoCobrancaPagamentos,
  });
  const { data: pessoas = [], isLoading: isPeopleLoading, isError: peopleError } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"], enabled: loadDivisionData });
  const { data: cartoes = [] } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: compras = [] } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });
  const { data: parcelasCompra = [] } = useQuery<ParcelaCompra[]>({ queryKey: ["/api/parcelas-compra"] });
  const { data: pessoaSaldoMovimentacoes = [], isLoading: isBalanceLoading, isError: balanceError } = useQuery<PessoaSaldoMovimentacao[]>({
    queryKey: ["/api/pessoas/saldo-movimentacoes"],
    enabled: loadDivisionData,
  });

  const createMutation = useMutation({
    mutationFn: (payload: ServicoPayload) => createServico(payload),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/usage"] });
      await invalidateFinancialQueries(queryClient);
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      toggleServicoStatus(id, status),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
      await invalidateFinancialQueries(queryClient);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteServico(id),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/usage"] });
      await invalidateFinancialQueries(queryClient);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Partial<ServicoPayload>) =>
      updateServico(id, payload),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
      await invalidateFinancialQueries(queryClient);
    },
  });

  return {
    servicos,
    servicoPessoas,
    servicoPagamentos,
    servicoCobrancaPagamentos,
    pessoas,
    cartoes,
    compras,
    parcelasCompra,
    pessoaSaldoMovimentacoes,
    isDivisionLoading: isPeopleLoading || isBalanceLoading,
    hasDivisionError: peopleError || balanceError,
    retryDivision: () => Promise.all([["/api/pessoas"], ["/api/pessoas/saldo-movimentacoes"]].map(queryKey => queryClient.invalidateQueries({ queryKey }))),
    isLoading,
    createMutation,
    toggleStatusMutation,
    deleteMutation,
    updateMutation,
  };
}
