import type { OfficialIconApiModel, OfficialIconPackApiModel } from "@/services/api/official-icons";
import { matchesIconCategory } from "@shared/icon-categories";

export type ExplorePackMatchSummary = {
  matchedIconsCount: number;
  matchedIconNames: string[];
};

function normalizeSearchTerm(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildIconSearchHaystack(icon: OfficialIconApiModel): string {
  return normalizeSearchTerm([
    icon.name,
    icon.iconKey,
    icon.category ?? "",
    icon.packName ?? "",
    icon.ownerLabel ?? "",
    icon.ownerPublicCode ?? "",
    ...(Array.isArray(icon.tags) ? icon.tags : []),
    ...(Array.isArray(icon.aliases) ? icon.aliases : []),
  ].join(" "));
}

function hasPackOrigin(icon: OfficialIconApiModel): boolean {
  return String(icon.packId ?? "").trim().length > 0
    || String(icon.packName ?? "").trim().length > 0
    || String(icon.packPublicCode ?? "").trim().length > 0
    || String(icon.packItemPublicCode ?? "").trim().length > 0;
}

function buildPackSearchHaystack(pack: OfficialIconPackApiModel): string {
  return normalizeSearchTerm([
    pack.name,
    pack.description ?? "",
    pack.category ?? "",
    pack.ownerLabel ?? "",
    pack.ownerPublicCode ?? "",
  ].join(" "));
}

export function hasExploreSearchTerm(value: string): boolean {
  return normalizeSearchTerm(value).length > 0;
}

export function resolveExploreIconsForView(
  icons: OfficialIconApiModel[],
  options: {
    search: string;
    category: string;
  },
): OfficialIconApiModel[] {
  const normalizedSearch = normalizeSearchTerm(options.search);
  const withCategory = icons.filter((icon) => matchesIconCategory(icon.category, options.category));

  if (!normalizedSearch) {
    return withCategory.filter((icon) => !hasPackOrigin(icon) && !icon.hiddenBecausePacked && !icon.representedInPack);
  }

  return withCategory.filter((icon) => {
    if (!buildIconSearchHaystack(icon).includes(normalizedSearch)) {
      return false;
    }
    // Mantém itens de pack visíveis durante busca, mas evita duplicatas
    // de publicações individuais equivalentes que já estejam representadas em pack.
    if (!hasPackOrigin(icon) && (icon.hiddenBecausePacked || icon.representedInPack)) {
      return false;
    }
    return true;
  });
}

export function buildPackMatchSummaryByPackId(icons: OfficialIconApiModel[]): Map<string, ExplorePackMatchSummary> {
  const map = new Map<string, ExplorePackMatchSummary>();

  for (const icon of icons) {
    const packId = String(icon.packId ?? "").trim();
    if (!packId) continue;

    const current = map.get(packId) ?? { matchedIconsCount: 0, matchedIconNames: [] };
    current.matchedIconsCount += 1;

    if (current.matchedIconNames.length < 3) {
      const exists = current.matchedIconNames.some(
        (name) => normalizeSearchTerm(name) === normalizeSearchTerm(icon.name),
      );
      if (!exists) {
        current.matchedIconNames.push(icon.name);
      }
    }

    map.set(packId, current);
  }

  return map;
}

export function resolveExplorePacksForView(
  packs: OfficialIconPackApiModel[],
  options: {
    search: string;
    matchingPackIds: Set<string>;
  },
): OfficialIconPackApiModel[] {
  const normalizedSearch = normalizeSearchTerm(options.search);
  if (!normalizedSearch) {
    return packs;
  }

  return packs.filter((pack) => {
    if (buildPackSearchHaystack(pack).includes(normalizedSearch)) {
      return true;
    }
    return options.matchingPackIds.has(pack.id);
  });
}

export function formatPackMatchHint(summary: ExplorePackMatchSummary | undefined): string | null {
  if (!summary || summary.matchedIconsCount <= 0) {
    return null;
  }

  if (summary.matchedIconsCount === 1 && summary.matchedIconNames[0]) {
    return `Contém: ${summary.matchedIconNames[0]}`;
  }

  return `${summary.matchedIconsCount} ícones encontrados neste pack`;
}
