import {
  type OfficialIconApiModel,
  type OfficialIconPackApiModel,
} from "@/services/api/official-icons";
import type { UserIconLibraryItemApiModel } from "@/services/api/user-icon-library";
import { resolveIconCategoryValue } from "@shared/icon-categories";

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
  if (progress.status === "full") return "Na sua biblioteca";
  if (progress.status === "partial") return `${progress.added}/${progress.total} na biblioteca`;
  return "Disponível";
}

export function getPackAddActionLabel(pack: OfficialIconPackApiModel): string {
  const progress = resolvePackProgress(pack);
  if (progress.status === "full") return "Na sua biblioteca";
  if (progress.status === "partial") return "Adicionar faltantes";
  return "Adicionar pack à minha biblioteca";
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
