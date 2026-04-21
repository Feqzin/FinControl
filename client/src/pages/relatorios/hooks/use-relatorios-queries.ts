import { useQuery } from "@tanstack/react-query";
import type {
  Cartao,
  CompraCartao,
  Divida,
  Patrimonio,
  Pessoa,
  Renda,
  Servico,
} from "@shared/schema";

export function useRelatoriosQueries() {
  const { data: rendas = [], isLoading: l1 } = useQuery<Renda[]>({ queryKey: ["/api/rendas"] });
  const { data: patrimonios = [], isLoading: l2 } = useQuery<Patrimonio[]>({ queryKey: ["/api/patrimonios"] });
  const { data: compras = [], isLoading: l3 } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });
  const { data: cartoes = [], isLoading: l4 } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: servicos = [], isLoading: l5 } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: dividas = [], isLoading: l6 } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: pessoas = [], isLoading: l7 } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });

  return {
    rendas,
    patrimonios,
    compras,
    cartoes,
    servicos,
    dividas,
    pessoas,
    isLoading: l1 || l2 || l3 || l4 || l5 || l6 || l7,
  };
}

