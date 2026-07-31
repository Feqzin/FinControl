type PessoaResumoParaFiltro = {
  dividas: {
    comigo: { pendente: number };
    euDevo: { pendente: number };
  };
  comprasVinculadas: { pendentePessoa: number };
  servicosMesAtual: { pendente: number };
};

type PessoaFilterTipo = "todos" | "me_deve" | "eu_devo" | "atrasados" | "lista_negra" | "removidas";

function toNumber(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return numeric;
}

export function getPessoaFilterFinancialTotals(resumo: PessoaResumoParaFiltro) {
  const valorMeDevem = toNumber(resumo.dividas.comigo.pendente)
    + toNumber(resumo.comprasVinculadas.pendentePessoa)
    + toNumber(resumo.servicosMesAtual.pendente);
  const valorEuDevo = toNumber(resumo.dividas.euDevo.pendente);

  return { valorMeDevem, valorEuDevo };
}

export function matchesPessoaTipoFilter(
  filterTipo: string,
  resumo: PessoaResumoParaFiltro,
): boolean {
  if (filterTipo === "todos" || filterTipo === "atrasados") return true;

  const { valorMeDevem, valorEuDevo } = getPessoaFilterFinancialTotals(resumo);

  if (filterTipo === "me_deve") {
    return valorMeDevem > 0;
  }
  if (filterTipo === "eu_devo") {
    return valorEuDevo > 0;
  }

  return false;
}

export type { PessoaFilterTipo, PessoaResumoParaFiltro };
