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

function normalizeIconKey(iconKey: string | null | undefined): string {
  return String(iconKey ?? "").trim().toLowerCase();
}

function normalizeImageReference(imageUrl: string | null | undefined): string {
  const raw = String(imageUrl ?? "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    return `${parsed.origin.toLowerCase()}${parsed.pathname}`;
  } catch {
    return raw.toLowerCase().split(/[?#]/)[0] ?? raw.toLowerCase();
  }
}

function resolvePackItemCode(icon: OfficialIconApiModel): string {
  const ownPackItemCode = String(icon.packItemPublicCode ?? "").trim();
  if (ownPackItemCode) return ownPackItemCode;

  const sourcePackItemCode = String(icon.sourcePackItemPublicCode ?? "").trim();
  if (sourcePackItemCode) return sourcePackItemCode;

  return "";
}

function hasPackOrigin(icon: OfficialIconApiModel): boolean {
  return String(icon.packId ?? "").trim().length > 0
    || String(icon.packName ?? "").trim().length > 0
    || String(icon.packPublicCode ?? "").trim().length > 0
    || String(icon.packItemPublicCode ?? "").trim().length > 0;
}

function buildIconFingerprint(icon: OfficialIconApiModel): string {
  return [
    normalizeSearchTerm(icon.name),
    normalizeSearchTerm(icon.category ?? ""),
    normalizeImageReference(icon.imageUrl),
  ].join("|");
}

function buildIconNameCategoryFingerprint(icon: OfficialIconApiModel): string {
  return [
    normalizeSearchTerm(icon.name),
    normalizeSearchTerm(icon.category ?? ""),
  ].join("|");
}

function parseCommunityKeyParts(iconKey: string): { ownerUserId: string; sourceUserIconId: string } | null {
  const normalized = String(iconKey ?? "").trim();
  if (!normalized.startsWith("community:")) return null;

  const payload = normalized.slice("community:".length);
  const delimiterIndex = payload.indexOf(":");
  if (delimiterIndex <= 0) return null;

  const ownerUserId = payload.slice(0, delimiterIndex).trim();
  const sourcePayload = payload.slice(delimiterIndex + 1).trim();
  const sourceUserIconId = sourcePayload.split(":pack:")[0]?.trim() ?? "";
  if (!ownerUserId || !sourceUserIconId) return null;

  return { ownerUserId, sourceUserIconId };
}

function buildCommunitySourceKey(icon: OfficialIconApiModel): string | null {
  const parsed = parseCommunityKeyParts(icon.iconKey);
  if (!parsed) return null;
  return `${parsed.ownerUserId}:${parsed.sourceUserIconId}`;
}

function dedupeExploreSearchIcons(icons: OfficialIconApiModel[]): OfficialIconApiModel[] {
  if (icons.length <= 1) return icons;

  const packItems = icons.filter(hasPackOrigin);
  const individualItems = icons.filter((icon) => !hasPackOrigin(icon));
  if (packItems.length === 0 || individualItems.length === 0) {
    return icons;
  }

  const packSourceUserIconIds = new Set<string>();
  const packCommunitySourceKeys = new Set<string>();
  const packItemCodes = new Set<string>();
  const packIconKeys = new Set<string>();
  const packFingerprints = new Set<string>();
  const packNameCategoryFingerprints = new Set<string>();

  for (const packIcon of packItems) {
    const sourceUserIconId = String(packIcon.sourceUserIconId ?? "").trim();
    if (sourceUserIconId) {
      packSourceUserIconIds.add(sourceUserIconId);
    }

    const communitySourceKey = buildCommunitySourceKey(packIcon);
    if (communitySourceKey) {
      packCommunitySourceKeys.add(communitySourceKey);
    }

    const packItemCode = resolvePackItemCode(packIcon);
    if (packItemCode) {
      packItemCodes.add(packItemCode);
    }

    const iconKey = normalizeIconKey(packIcon.iconKey);
    if (iconKey) {
      packIconKeys.add(iconKey);
    }

    packFingerprints.add(buildIconFingerprint(packIcon));
    packNameCategoryFingerprints.add(buildIconNameCategoryFingerprint(packIcon));
  }

  const filteredIndividuals = individualItems.filter((icon) => {
    const packItemCode = resolvePackItemCode(icon);
    if (packItemCode && packItemCodes.has(packItemCode)) {
      return false;
    }

    const iconKey = normalizeIconKey(icon.iconKey);
    if (iconKey && packIconKeys.has(iconKey)) {
      return false;
    }

    const sourceUserIconId = String(icon.sourceUserIconId ?? "").trim();
    if (sourceUserIconId && packSourceUserIconIds.has(sourceUserIconId)) {
      return false;
    }

    const communitySourceKey = buildCommunitySourceKey(icon);
    if (communitySourceKey && packCommunitySourceKeys.has(communitySourceKey)) {
      return false;
    }

    const fingerprint = buildIconFingerprint(icon);
    if (packFingerprints.has(fingerprint)) {
      return false;
    }

    const nameCategoryFingerprint = buildIconNameCategoryFingerprint(icon);
    if (packNameCategoryFingerprints.has(nameCategoryFingerprint)) {
      return false;
    }

    return true;
  });

  if (filteredIndividuals.length === individualItems.length) {
    return icons;
  }

  return [...packItems, ...filteredIndividuals];
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
    return dedupeExploreSearchIcons(withCategory);
  }

  const matched = withCategory.filter((icon) => {
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

  return dedupeExploreSearchIcons(matched);
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
