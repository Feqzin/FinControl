import type { Servico } from "@shared/schema";

export function buildServicoFixture(overrides: Partial<Servico> = {}): Servico {
  return {
    id: "servico-fixture",
    userId: "user-financial-unit",
    nome: "Servico Fixture",
    categoria: "utilidades",
    valorMensal: "100.00",
    periodicidadeCobranca: "mensal",
    valorCobranca: "100.00",
    dataCobranca: 10,
    formaPagamento: "debito",
    compraCartaoId: null,
    status: "ativo",
    iconeId: null,
    ...overrides,
  };
}
