import { getItemTerms } from "@/components/icon-picker.utils";
import { LIBRARY_ICONS } from "@/lib/brand-icons";
import {
  isRemoteIconReference,
  type PersistableIconSelectionCandidate,
  resolvePersistableIconSelectionId,
  trimIconPersistenceValue,
} from "@shared/icon-persistence";

type ResolveEditCompraIconPresentationInput = {
  persistedIconId: string | null;
  editedIconId: string | null;
  iconDirty: boolean;
  autoSuggestedIconId: string | null;
};

type ResolvePersistableCompraIconIdInput = {
  iconDirty: boolean;
  editedDisplayIconId: string | null;
  explicitPersistableIconId?: string | null | undefined;
  selectedIcon?: (PersistableIconSelectionCandidate & {
    displayValue?: string | null;
  }) | null;
  userIcons?: Array<{ id: string; imageUrl: string }>;
};

export type EditCompraIconSource = "manual" | "suggested" | "fallback";

export type EditCompraIconPresentation = {
  source: EditCompraIconSource;
  manualIconId: string | null;
  previewIconId: string | null;
  hint: string;
};

export function resolveEditCompraIconPresentation(
  input: ResolveEditCompraIconPresentationInput,
): EditCompraIconPresentation {
  const manualIconId = input.iconDirty
    ? (input.editedIconId ?? null)
    : (input.persistedIconId ?? null);

  if (manualIconId) {
    return {
      source: "manual",
      manualIconId,
      previewIconId: manualIconId,
      hint: "Ícone manual selecionado para esta compra",
    };
  }

  if (input.autoSuggestedIconId) {
    return {
      source: "suggested",
      manualIconId: null,
      previewIconId: input.autoSuggestedIconId,
      hint: "Ícone sugerido por palavra-chave (ainda não salvo na compra)",
    };
  }

  return {
    source: "fallback",
    manualIconId: null,
    previewIconId: null,
    hint: "Sem ícone manual salvo",
  };
}

export function buildEditCompraIconUpdatePatch(
  input: { iconDirty: boolean; editedIconId: string | null },
): { iconeId?: string | null } {
  if (!input.iconDirty) return {};
  return { iconeId: input.editedIconId ?? null };
}

export function resolveEditCompraIconRuleTarget(
  input: {
    applyRule: boolean;
    iconDirty: boolean;
    editedIconId: string | null;
    editedPersistableIconId?: string | null;
    persistedIconId: string | null;
    persistedPersistableIconId?: string | null;
  },
): string | null {
  if (!input.applyRule) return null;

  const manualIconId = input.iconDirty
    ? (input.editedPersistableIconId ?? input.editedIconId ?? null)
    : (input.persistedPersistableIconId ?? input.persistedIconId ?? null);

  const trimmed = trimIconPersistenceValue(manualIconId);
  if (typeof trimmed !== "string" || trimmed.length === 0 || isRemoteIconReference(trimmed)) {
    return null;
  }
  return trimmed;
}

type ResolvePersistableCompraIconIdResult =
  | { ok: true; value: string | null | undefined }
  | { ok: false; reason: "INVALID_ICON_ID_REFERENCE" | "MISSING_PERSISTABLE_ICON_ID" };

const GENERIC_ICON_RULE_TERMS = new Set([
  "mercado",
  "supermercado",
  "banco",
  "cartao",
  "pagamento",
]);

function normalizeRuleTerm(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldKeepRuleTerm(normalizedTerm: string): boolean {
  return normalizedTerm.length >= 3 && !GENERIC_ICON_RULE_TERMS.has(normalizedTerm);
}

function addUniqueRuleTerm(target: Map<string, string>, rawValue: string): void {
  const originalTerm = rawValue.trim();
  if (!originalTerm) return;

  const normalizedTerm = normalizeRuleTerm(originalTerm);
  if (!shouldKeepRuleTerm(normalizedTerm) || target.has(normalizedTerm)) {
    return;
  }

  target.set(normalizedTerm, originalTerm);

  const tokens = normalizedTerm.split(" ").filter(Boolean);
  if (tokens.length === 2 && tokens.every((token) => /^[a-z]+$/.test(token))) {
    const compactTerm = tokens.join("");
    if (shouldKeepRuleTerm(compactTerm) && !target.has(compactTerm)) {
      target.set(compactTerm, compactTerm);
    }
  }
}

export function resolvePersistableCompraIconId(
  input: ResolvePersistableCompraIconIdInput,
): ResolvePersistableCompraIconIdResult {
  if (!input.iconDirty) {
    return { ok: true, value: undefined };
  }

  if (input.editedDisplayIconId === null) {
    return { ok: true, value: null };
  }

  const trimmedDisplay = trimIconPersistenceValue(input.editedDisplayIconId);
  const trimmedSelectedDisplay = trimIconPersistenceValue(input.selectedIcon?.displayValue);
  const selectedIconMatchesDisplay = trimmedSelectedDisplay === trimmedDisplay;
  const selectedPersistable = selectedIconMatchesDisplay && input.selectedIcon
    ? resolvePersistableIconSelectionId(input.selectedIcon)
    : null;
  if (selectedPersistable) {
    return { ok: true, value: selectedPersistable };
  }

  const explicitPersistable = resolvePersistableIconSelectionId({
    id: input.explicitPersistableIconId,
  });
  if (explicitPersistable) {
    return { ok: true, value: explicitPersistable };
  }

  if (trimmedDisplay == null) {
    return { ok: true, value: null };
  }

  if (typeof trimmedDisplay !== "string") {
    return { ok: true, value: null };
  }

  if (isRemoteIconReference(trimmedDisplay)) {
    return {
      ok: false,
      reason: selectedIconMatchesDisplay ? "MISSING_PERSISTABLE_ICON_ID" : "INVALID_ICON_ID_REFERENCE",
    };
  }

  return { ok: true, value: trimmedDisplay };
}

export function buildCompraIconMatchRuleTerms(input: {
  persistableIconId: string | null;
  userIcons?: Array<{ id: string; name: string; tags?: string[] | null }>;
}): string[] {
  const persistableIconId = resolvePersistableIconSelectionId({
    id: input.persistableIconId,
  });
  if (!persistableIconId) return [];

  const terms = new Map<string, string>();
  const personalIcon = (input.userIcons ?? []).find((icon) => icon.id === persistableIconId);
  if (personalIcon) {
    for (const term of getItemTerms({
      name: personalIcon.name,
      tags: personalIcon.tags ?? [],
    })) {
      addUniqueRuleTerm(terms, term);
    }
    return Array.from(terms.values());
  }

  const builtinIcon = LIBRARY_ICONS.find((icon) => icon.key === persistableIconId);
  if (builtinIcon) {
    addUniqueRuleTerm(terms, builtinIcon.label);
  }

  return Array.from(terms.values());
}
