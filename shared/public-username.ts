export const PUBLIC_USERNAME_REGEX = /^[a-z0-9._-]{3,30}$/;
export const PUBLIC_USERNAME_EMAIL_LIKE_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function normalizePublicUsername(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function isEmailLikeUsername(value: unknown): boolean {
  const normalized = normalizePublicUsername(value);
  if (!normalized) return false;
  return PUBLIC_USERNAME_EMAIL_LIKE_REGEX.test(normalized);
}

export function hasValidPublicUsername(value: unknown): boolean {
  const normalized = normalizePublicUsername(value);
  if (!normalized) return false;
  if (isEmailLikeUsername(normalized)) return false;
  return PUBLIC_USERNAME_REGEX.test(normalized);
}

export function validatePublicUsername(value: unknown): string | null {
  const normalized = normalizePublicUsername(value);
  if (!normalized) return "Informe o usuário público.";
  if (isEmailLikeUsername(normalized)) return "O usuário público não pode ser um e-mail.";
  if (!PUBLIC_USERNAME_REGEX.test(normalized)) {
    return "Usuário público inválido. Use 3 a 30 caracteres com letras minúsculas, números, ponto, underline ou hífen.";
  }
  return null;
}

export function resolvePublicUsernameForResponse(value: unknown): string | null {
  const normalized = normalizePublicUsername(value);
  if (!normalized) return null;
  if (!hasValidPublicUsername(normalized)) return null;
  return normalized;
}
