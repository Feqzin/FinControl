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
  },
): string | null {
  if (!input.applyRule) return null;

  const manualIconId = input.iconDirty
    ? (input.editedPersistableIconId ?? input.editedIconId ?? null)
    : (input.persistedIconId ?? null);

  if (!manualIconId) return null;
  const trimmed = manualIconId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type ResolvePersistableCompraIconIdResult =
  | { ok: true; value: string | null | undefined }
  | { ok: false; reason: "ICON_REFERENCE_INVALID" };

export function resolvePersistableCompraIconId(
  input: ResolvePersistableCompraIconIdInput,
): ResolvePersistableCompraIconIdResult {
  if (!input.iconDirty) {
    return { ok: true, value: undefined };
  }

  if (input.editedDisplayIconId === null) {
    return { ok: true, value: null };
  }

  const explicitPersistable = typeof input.explicitPersistableIconId === "string"
    ? input.explicitPersistableIconId.trim()
    : "";
  if (explicitPersistable.length > 0) {
    return { ok: true, value: explicitPersistable };
  }

  const trimmedDisplay = input.editedDisplayIconId.trim();
  if (!trimmedDisplay) {
    return { ok: true, value: null };
  }

  const looksLikeRemoteReference = /^data:/i.test(trimmedDisplay) || /^https?:\/\//i.test(trimmedDisplay);

  if (!looksLikeRemoteReference) {
    return { ok: true, value: trimmedDisplay };
  }

  const matchedUserIcon = (input.userIcons ?? []).find((icon) => {
    const normalizedImageUrl = icon.imageUrl.trim();
    return normalizedImageUrl.length > 0 && normalizedImageUrl === trimmedDisplay;
  });

  if (!matchedUserIcon) {
    return { ok: false, reason: "ICON_REFERENCE_INVALID" };
  }

  return { ok: true, value: matchedUserIcon.id };
}
