import type { Divida, Parcela } from "@shared/schema";

export type DashboardReceivableItem = {
  id: string;
  dividaId: string;
  pessoaId: string;
  descricao: string | null;
  numeroParcela: number | null;
  valor: number;
};

function isOutstanding(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized !== "pago" && normalized !== "cancelado";
}

export function getDashboardReceivablesForMonth(params: {
  dividas: Divida[];
  parcelas: Parcela[];
  monthReference: string;
}): DashboardReceivableItem[] {
  const parcelasByDividaId = new Map<string, Parcela[]>();
  const items: DashboardReceivableItem[] = [];

  for (const parcela of params.parcelas) {
    const rows = parcelasByDividaId.get(parcela.dividaId) ?? [];
    rows.push(parcela);
    parcelasByDividaId.set(parcela.dividaId, rows);
  }

  for (const divida of params.dividas) {
    if (
      divida.tipo !== "receber"
      || divida.expectativaRecebimento === false
      || divida.deletedAt
    ) {
      continue;
    }

    const parcelas = parcelasByDividaId.get(divida.id) ?? [];

    if (parcelas.length > 0) {
      for (const parcela of parcelas) {
        if (
          !isOutstanding(parcela.status)
          || !parcela.dataVencimento.startsWith(params.monthReference)
        ) {
          continue;
        }

        items.push({
          id: parcela.id,
          dividaId: divida.id,
          pessoaId: divida.pessoaId,
          descricao: divida.descricao,
          numeroParcela: parcela.numero,
          valor: Number(parcela.valor) || 0,
        });
      }
      continue;
    }

    if (
      isOutstanding(divida.status)
      && String(divida.dataVencimento ?? "").startsWith(params.monthReference)
    ) {
      items.push({
        id: divida.id,
        dividaId: divida.id,
        pessoaId: divida.pessoaId,
        descricao: divida.descricao,
        numeroParcela: null,
        valor: Number(divida.valor) || 0,
      });
    }
  }

  return items.sort((left, right) => right.valor - left.valor);
}
