import type { UserIconLibraryItemApiModel } from "@/services/api/user-icon-library";
import { getIconCategoryLabel, matchesIconCategory } from "@shared/icon-categories";

export type PersonalIconSortOrder = "recent" | "name-asc" | "category";

export type PaginationResult<T> = {
  items: T[];
  page: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
};

function normalizeSearchToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function filterAndSortPersonalIcons(
  icons: UserIconLibraryItemApiModel[],
  options: {
    search: string;
    category: string;
    sort: PersonalIconSortOrder;
  },
): UserIconLibraryItemApiModel[] {
  const normalizedSearch = normalizeSearchToken(options.search);

  const filtered = icons.filter((icon) => {
    if (!matchesIconCategory(icon.category, options.category)) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const terms = [
      icon.name,
      icon.category ?? "",
      getIconCategoryLabel(icon.category),
      ...(Array.isArray(icon.tags) ? icon.tags : []),
    ];

    return terms.some((term) => normalizeSearchToken(String(term ?? "")).includes(normalizedSearch));
  });

  return filtered.slice().sort((a, b) => {
    if (options.sort === "name-asc") {
      return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    }

    if (options.sort === "category") {
      const categoryDiff = getIconCategoryLabel(a.category).localeCompare(
        getIconCategoryLabel(b.category),
        "pt-BR",
        { sensitivity: "base" },
      );
      if (categoryDiff !== 0) {
        return categoryDiff;
      }
      return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
    }

    const dateA = Date.parse(a.createdAt || a.updatedAt || "") || 0;
    const dateB = Date.parse(b.createdAt || b.updatedAt || "") || 0;
    if (dateA !== dateB) {
      return dateB - dateA;
    }

    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
  });
}

export function paginateItems<T>(items: T[], page: number, pageSize: number): PaginationResult<T> {
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 1;
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.max(1, Math.min(Math.floor(page), totalPages));
  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * safePageSize;
  const endExclusive = Math.min(totalItems, startIndex + safePageSize);

  return {
    items: items.slice(startIndex, endExclusive),
    page: safePage,
    totalPages,
    totalItems,
    startIndex,
    endIndex: endExclusive,
  };
}
