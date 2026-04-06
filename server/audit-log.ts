type AuditAction = "create" | "update" | "delete" | "payment" | "auth" | "import";
type AuditStatus = "success" | "failure" | "error";

type Primitive = string | number | boolean | null | undefined;
type JsonLike = Primitive | JsonLike[] | { [key: string]: JsonLike };

export type AuditEvent = {
  action: AuditAction;
  status: AuditStatus;
  domain: string;
  route: string;
  method: string;
  userId?: string | null;
  targetId?: string | null;
  details?: { [key: string]: JsonLike };
  error?: string;
};

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized.includes("password") ||
    normalized === "token" ||
    normalized.endsWith("token") ||
    normalized.includes("resetlink")
  );
}

function sanitizeValue(value: unknown): JsonLike {
  if (value === null || value === undefined) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (typeof value !== "object") return String(value);

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, JsonLike> = {};
  for (const [key, child] of Object.entries(record)) {
    sanitized[key] = isSensitiveKey(key) ? "[REDACTED]" : sanitizeValue(child);
  }
  return sanitized;
}

export function writeAuditLog(event: AuditEvent): void {
  try {
    const payload = {
      type: "audit",
      timestamp: new Date().toISOString(),
      ...event,
      details: event.details ? sanitizeValue(event.details) : undefined,
      error: event.error ? String(event.error) : undefined,
    };
    console.log(JSON.stringify(payload));
  } catch {
    // never break request flow because of audit logs
  }
}
