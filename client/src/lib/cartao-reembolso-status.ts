import type { CompraCartao, ParcelaCompra } from "@shared/schema";
import { buildCompraReembolsoBreakdown } from "@shared/compra-reembolso";

export type CompraReembolsoVisualStatus =
  | "sem_reembolso_vinculado"
  | "aguardando_reembolso"
  | "reembolsado"
  | "reembolso_vencido";

type NormalizedStatus = "pendente" | "pago" | "vencido" | "cancelado";

function normalizeStatusPessoa(value: string | null | undefined): NormalizedStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pago") return "pago";
  if (normalized === "vencido") return "vencido";
  if (normalized === "cancelado") return "cancelado";
  return "pendente";
}

function isStatusLiquidated(status: NormalizedStatus): boolean {
  return status === "pago" || status === "cancelado";
}

export function getCompraReembolsoVisualStatus(
  compra: CompraCartao,
  parcelas: ParcelaCompra[],
  referenceDate: string = new Date().toISOString().slice(0, 10),
): CompraReembolsoVisualStatus {
  if (!compra.pessoaId) return "sem_reembolso_vinculado";

  const breakdown = buildCompraReembolsoBreakdown(compra);
  if (breakdown.reembolsoPessoaCents <= 0) return "sem_reembolso_vinculado";

  const parcelasRelevantes = parcelas
    .filter((parcela) => parcela.compraCartaoId === compra.id)
    .filter((parcela) => {
      const parcelaIndex = Number(parcela.numero) - 1;
      return (breakdown.reembolsoPorParcelaCents[parcelaIndex] ?? 0) > 0;
    });

  if (parcelasRelevantes.length === 0) {
    const parentStatus = normalizeStatusPessoa(compra.statusPessoa);
    if (parentStatus === "pago") return "reembolsado";
    if (parentStatus === "vencido") return "reembolso_vencido";
    return "aguardando_reembolso";
  }

  let hasPending = false;
  let hasOverdue = false;

  for (const parcela of parcelasRelevantes) {
    const status = normalizeStatusPessoa(parcela.statusPessoa);
    if (isStatusLiquidated(status)) continue;

    hasPending = true;
    if (
      status === "vencido"
      || (typeof parcela.dataVencimento === "string" && parcela.dataVencimento < referenceDate)
    ) {
      hasOverdue = true;
    }
  }

  if (!hasPending) return "reembolsado";
  return hasOverdue ? "reembolso_vencido" : "aguardando_reembolso";
}

export function isCompraReembolsoOutstanding(
  status: CompraReembolsoVisualStatus,
): boolean {
  return status === "aguardando_reembolso" || status === "reembolso_vencido";
}
