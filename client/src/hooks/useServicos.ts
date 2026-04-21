import { useMutation, useQuery } from "@tanstack/react-query";
import type { Pessoa, Servico, ServicoPagamento, ServicoPessoa } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import {
  createServico,
  deleteServico,
  toggleServicoStatus,
  updateServico,
  type ServicoPayload,
} from "@/services/api/servicos";

export function useServicos() {
  const { data: servicos = [], isLoading } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: servicoPessoas = [] } = useQuery<ServicoPessoa[]>({ queryKey: ["/api/servico-pessoas"] });
  const { data: servicoPagamentos = [] } = useQuery<ServicoPagamento[]>({ queryKey: ["/api/servico-pagamentos"] });
  const { data: pessoas = [] } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });

  const createMutation = useMutation({
    mutationFn: (payload: ServicoPayload) => createServico(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      toggleServicoStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteServico(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Partial<ServicoPayload>) =>
      updateServico(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
    },
  });

  return {
    servicos,
    servicoPessoas,
    servicoPagamentos,
    pessoas,
    isLoading,
    createMutation,
    toggleStatusMutation,
    deleteMutation,
    updateMutation,
  };
}
