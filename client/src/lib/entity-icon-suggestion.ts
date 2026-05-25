import { LIBRARY_ICONS } from "@/lib/brand-icons";
import {
  matchIconByText,
  type PurchaseIconMatchResult,
  type UserIconMatchRule,
} from "@/lib/purchase-icon-matching";
import type { UserIconLibraryItemApiModel } from "@/services/api/user-icon-library";

const BUILTIN_ICON_KEYS = new Set(LIBRARY_ICONS.map((icon) => icon.key));

function isRemoteIconReference(value: string): boolean {
  return /^data:/i.test(value) || /^https?:\/\//i.test(value);
}

export type ResolvedEntityIconReference = {
  displayIconId: string | null;
  persistableIconId: string | null;
  label: string | null;
  isBuiltin: boolean;
  isPersonal: boolean;
};

export function resolveEntityIconReference(
  iconId: string | null | undefined,
  userIcons: UserIconLibraryItemApiModel[] = [],
): ResolvedEntityIconReference {
  const trimmed = typeof iconId === "string" ? iconId.trim() : "";
  if (!trimmed) {
    return {
      displayIconId: null,
      persistableIconId: null,
      label: null,
      isBuiltin: false,
      isPersonal: false,
    };
  }

  const personalById = userIcons.find((icon) => icon.id === trimmed);
  if (personalById) {
    return {
      displayIconId: personalById.imageUrl,
      persistableIconId: personalById.id,
      label: personalById.name,
      isBuiltin: false,
      isPersonal: true,
    };
  }

  const personalByImageUrl = userIcons.find((icon) => icon.imageUrl === trimmed);
  if (personalByImageUrl) {
    return {
      displayIconId: personalByImageUrl.imageUrl,
      persistableIconId: personalByImageUrl.id,
      label: personalByImageUrl.name,
      isBuiltin: false,
      isPersonal: true,
    };
  }

  if (BUILTIN_ICON_KEYS.has(trimmed)) {
    const builtin = LIBRARY_ICONS.find((icon) => icon.key === trimmed);
    return {
      displayIconId: trimmed,
      persistableIconId: trimmed,
      label: builtin?.label ?? trimmed,
      isBuiltin: true,
      isPersonal: false,
    };
  }

  if (isRemoteIconReference(trimmed)) {
    return {
      displayIconId: trimmed,
      persistableIconId: null,
      label: null,
      isBuiltin: false,
      isPersonal: false,
    };
  }

  return {
    displayIconId: trimmed,
    persistableIconId: trimmed,
    label: null,
    isBuiltin: false,
    isPersonal: false,
  };
}

export type EntityIconSuggestionResult = {
  match: PurchaseIconMatchResult;
  displayIconId: string | null;
  persistableIconId: string | null;
  label: string | null;
  shouldAutoApply: boolean;
  shouldSuggest: boolean;
};

export function resolveEntityIconSuggestion(params: {
  name: string;
  userRules: UserIconMatchRule[];
  userIcons: UserIconLibraryItemApiModel[];
}): EntityIconSuggestionResult {
  const match = matchIconByText(params.name, params.userRules);
  if (!match.matched || !match.iconId) {
    return {
      match,
      displayIconId: null,
      persistableIconId: null,
      label: null,
      shouldAutoApply: false,
      shouldSuggest: false,
    };
  }

  const resolved = resolveEntityIconReference(match.iconId, params.userIcons);
  const hasPersistableReference = Boolean(resolved.persistableIconId);

  return {
    match,
    displayIconId: resolved.displayIconId,
    persistableIconId: resolved.persistableIconId,
    label: resolved.label ?? match.label ?? null,
    shouldAutoApply: match.shouldAutoApply && hasPersistableReference,
    shouldSuggest: match.shouldSuggest && hasPersistableReference,
  };
}

export function resolveEntityIconIdForSave(params: {
  isManualSelection: boolean;
  manualPersistableIconId: string | null;
  autoSuggestion: EntityIconSuggestionResult;
}): string | null {
  if (params.isManualSelection) {
    return params.manualPersistableIconId ?? null;
  }

  if (params.autoSuggestion.shouldAutoApply) {
    return params.autoSuggestion.persistableIconId ?? null;
  }

  return null;
}

