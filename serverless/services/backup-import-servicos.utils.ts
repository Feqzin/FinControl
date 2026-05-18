import { resolveServicoBillingFields } from "../../shared/servico-periodicidade.js";

type ServicoBackupBillingInput = {
  valorMensal?: string | number | null;
  valorCobranca?: string | number | null;
  periodicidadeCobranca?: string | null;
};

export type ServicoBackupBillingResolved = {
  valorMensal: string;
  valorCobranca: string;
  periodicidadeCobranca: string;
};

function hasMoneyInput(value: string | number | null | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  return value.trim() !== "";
}

export function resolveServicoBackupBillingFields(
  input: ServicoBackupBillingInput,
  label: string,
): ServicoBackupBillingResolved {
  const hasValorMensal = hasMoneyInput(input.valorMensal);
  const hasValorCobranca = hasMoneyInput(input.valorCobranca);

  if (!hasValorMensal && !hasValorCobranca) {
    throw new Error(
      `Campo obrigatorio invalido: ${label}.valorMensal (ou ${label}.valorCobranca)`,
    );
  }

  const resolved = resolveServicoBillingFields({
    valorMensal: input.valorMensal ?? null,
    valorCobranca: input.valorCobranca ?? null,
    periodicidadeCobranca: input.periodicidadeCobranca ?? null,
  });

  return {
    valorMensal: resolved.valorMensal,
    valorCobranca: resolved.valorCobranca,
    periodicidadeCobranca: resolved.periodicidadeCobranca,
  };
}

