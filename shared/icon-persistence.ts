export const INVALID_ICON_ID_REFERENCE_ERROR_CODE = "INVALID_ICON_ID_REFERENCE";
export const INVALID_ICON_ID_REFERENCE_MESSAGE = "O ícone selecionado não possui uma referência válida para salvar.";

const REMOTE_ICON_REFERENCE_PATTERN = /^(data:|https?:\/\/)/i;

export type PersistableIconSelectionCandidate = {
  id?: string | null;
  userIconId?: string | null;
  personalIconId?: string | null;
  officialIconId?: string | null;
  iconId?: string | null;
  imageUrl?: string | null;
  previewUrl?: string | null;
  url?: string | null;
  dataUrl?: string | null;
  storagePath?: string | null;
};

export function trimIconPersistenceValue(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isRemoteIconReference(value: string | null | undefined): boolean {
  const trimmed = trimIconPersistenceValue(value);
  return typeof trimmed === "string" && REMOTE_ICON_REFERENCE_PATTERN.test(trimmed);
}

export function resolvePersistableIconSelectionId(candidate: PersistableIconSelectionCandidate): string | null {
  const orderedKeys: Array<keyof PersistableIconSelectionCandidate> = [
    "id",
    "userIconId",
    "personalIconId",
    "officialIconId",
    "iconId",
  ];

  for (const key of orderedKeys) {
    const trimmed = trimIconPersistenceValue(candidate[key]);
    if (typeof trimmed === "string" && trimmed.length > 0 && !isRemoteIconReference(trimmed)) {
      return trimmed;
    }
  }

  return null;
}
