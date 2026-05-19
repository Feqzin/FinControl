type ResolveEditCompraIconPresentationInput = {
  persistedIconId: string | null;
  editedIconId: string | null;
  iconDirty: boolean;
  autoSuggestedIconId: string | null;
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
    persistedIconId: string | null;
  },
): string | null {
  if (!input.applyRule) return null;

  const manualIconId = input.iconDirty
    ? (input.editedIconId ?? null)
    : (input.persistedIconId ?? null);

  if (!manualIconId) return null;
  const trimmed = manualIconId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

