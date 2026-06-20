import {
  type OfficialIconApiModel,
  type OfficialIconPackApiModel,
} from "@/services/api/official-icons";
import type { UserIconLibraryItemApiModel } from "@/services/api/user-icon-library";
import { resolveIconCategoryValue } from "@shared/icon-categories";

export const PACK_RATING_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Ruim",
  2: "Fraco",
  3: "Regular",
  4: "Bom",
  5: "Excelente",
};

export function resolveUserIconCategory(value: string | null | undefined): string {
  return resolveIconCategoryValue(value);
}

export function getItemTerms(item: Pick<UserIconLibraryItemApiModel, "name" | "tags">): string[] {
  const terms = [item.name, ...(Array.isArray(item.tags) ? item.tags : [])]
    .map((term) => String(term ?? "").trim())
    .filter((term) => term.length > 0);
  return Array.from(new Set(terms));
}

export function resolvePackProgress(pack: OfficialIconPackApiModel): {
  total: number;
  added: number;
  missing: number;
  status: "none" | "partial" | "full";
} {
  const total = Math.max(0, Number(pack.iconsCount) || 0);
  const added = Math.max(0, Math.min(total, Number(pack.addedIconsCount) || 0));
  const missing = Math.max(0, total - added);
  const status = added <= 0
    ? "none"
    : added >= total
      ? "full"
      : "partial";
  return { total, added, missing, status };
}

export function getPackLibrarySummaryLabel(pack: OfficialIconPackApiModel): string {
  const progress = resolvePackProgress(pack);
  if (progress.status === "full") return "Pack instalado";
  if (progress.status === "partial") return `${progress.added}/${progress.total} ícones instalados`;
  return "Pack não instalado";
}

export function getPackLibraryStatusBadge(pack: OfficialIconPackApiModel): {
  label: string;
  variant: "secondary" | "outline";
} {
  const progress = resolvePackProgress(pack);
  if (progress.status === "full") {
    return { label: "Pack instalado", variant: "secondary" };
  }
  if (progress.status === "partial") {
    return { label: "Pack parcial", variant: "outline" };
  }
  return { label: "Pack não instalado", variant: "outline" };
}

export function getPackAddActionLabel(pack: OfficialIconPackApiModel): string {
  const progress = resolvePackProgress(pack);
  if (progress.status === "full") return "Pack já instalado";
  return "Adicionar pack completo";
}

export function getPackRatingLabel(rating: number | null | undefined): string {
  if (!rating) return "Sem avaliações";
  const normalized = Math.max(1, Math.min(5, Math.round(Number(rating) || 0))) as 1 | 2 | 3 | 4 | 5;
  return PACK_RATING_LABELS[normalized];
}

export function getPackRatingSummaryLabel(pack: OfficialIconPackApiModel): string {
  const ratingCount = Math.max(0, Number(pack.ratingCount) || 0);
  const ratingAverage = Number(pack.ratingAverage);
  if (ratingCount <= 0 || !Number.isFinite(ratingAverage)) {
    return "Sem avaliações";
  }
  const formattedAverage = ratingAverage.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${formattedAverage} · ${ratingCount} ${ratingCount === 1 ? "avaliação" : "avaliações"}`;
}

export function getPackInstallCountLabel(pack: OfficialIconPackApiModel): string {
  const installCount = Math.max(0, Number(pack.installCount) || 0);
  return `${installCount} ${installCount === 1 ? "download" : "downloads"}`;
}

export function getExploreIconPackOriginLabel(icon: OfficialIconApiModel): string {
  const packName = String(icon.packName ?? "").trim();
  if (packName) {
    return `Pack: ${packName}`;
  }

  const packPublicCode = String(icon.packPublicCode ?? "").trim();
  if (packPublicCode) {
    return `Pack: ${packPublicCode}`;
  }

  const packId = String(icon.packId ?? "").trim();
  if (packId) {
    return "Pack publicado";
  }

  return "Origem: Ícone individual";
}

export function formatCommunityAuthorLabel(ownerLabel: string | null | undefined): string {
  const normalized = String(ownerLabel ?? "").trim();
  return normalized || "Usuário";
}
