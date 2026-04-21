import { createHash } from "node:crypto";
import { pool } from "./db";
import { ENV } from "./env";
import { sanitizeForLog, type JsonLike, writeBusinessLog, writeTechnicalLog } from "./logger";

export type AuditAction = "create" | "update" | "delete" | "payment" | "auth" | "import";
export type AuditStatus = "success" | "failure" | "error";

export type AuditEvent = {
  action: AuditAction;
  status: AuditStatus;
  domain: string;
  route: string;
  method: string;
  userId?: string | null;
  targetId?: string | null;
  requestId?: string | null;
  requestIp?: string | null;
  userAgent?: string | null;
  details?: { [key: string]: JsonLike };
  error?: string;
};

type PersistableAuditEvent = {
  action: AuditAction;
  status: AuditStatus;
  domain: string;
  route: string;
  method: string;
  userId: string | null;
  targetId: string | null;
  requestId: string | null;
  ipHash: string | null;
  userAgent: string | null;
  details: JsonLike | null;
  error: string | null;
};

let persistenceWarningLogged = false;

function hashRequestIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const normalized = ip.trim();
  if (!normalized) return null;
  return createHash("sha256")
    .update(`${ENV.sessionSecret}:${normalized}`)
    .digest("hex")
    .slice(0, 24);
}

function sanitizeDetails(details: AuditEvent["details"]): JsonLike | null {
  if (!details) return null;
  return sanitizeForLog(details, {
    redactFinancial: true,
    dropHeavyPayloads: true,
    maxArrayLength: 15,
    maxObjectKeys: 20,
    maxStringLength: 180,
  });
}

function sanitizeError(error: string | undefined): string | null {
  if (!error) return null;
  const sanitized = sanitizeForLog(
    { error },
    {
      redactFinancial: true,
      dropHeavyPayloads: true,
      maxStringLength: 220,
    },
  ) as { error?: JsonLike };
  const safe = sanitized.error;
  return typeof safe === "string" ? safe : String(safe ?? "");
}

function sanitizeRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) return "/";
  return trimmed.length > 180 ? `${trimmed.slice(0, 180)}...[TRUNCATED]` : trimmed;
}

function sanitizeMethod(method: string): string {
  const normalized = method.trim().toUpperCase();
  if (!normalized) return "UNKNOWN";
  return normalized.length > 16 ? normalized.slice(0, 16) : normalized;
}

function sanitizeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const normalized = userAgent.trim();
  if (!normalized) return null;
  return normalized.length > 180 ? `${normalized.slice(0, 180)}...[TRUNCATED]` : normalized;
}

function toPersistableEvent(event: AuditEvent): PersistableAuditEvent {
  return {
    action: event.action,
    status: event.status,
    domain: event.domain,
    route: sanitizeRoute(event.route),
    method: sanitizeMethod(event.method),
    userId: event.userId ?? null,
    targetId: event.targetId ?? null,
    requestId: event.requestId?.trim() || null,
    ipHash: hashRequestIp(event.requestIp),
    userAgent: sanitizeUserAgent(event.userAgent),
    details: sanitizeDetails(event.details),
    error: sanitizeError(event.error),
  };
}

async function persistAuditEvent(event: PersistableAuditEvent): Promise<void> {
  await pool.query(
    `
      INSERT INTO audit_events (
        action,
        status,
        domain,
        route,
        method,
        user_id,
        target_id,
        request_id,
        ip_hash,
        user_agent,
        details,
        error
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
    `,
    [
      event.action,
      event.status,
      event.domain,
      event.route,
      event.method,
      event.userId,
      event.targetId,
      event.requestId,
      event.ipHash,
      event.userAgent,
      event.details ? JSON.stringify(event.details) : null,
      event.error,
    ],
  );
}

export function writeAuditLog(event: AuditEvent): void {
  try {
    const persistable = toPersistableEvent(event);

    writeBusinessLog({
      event: `audit.${persistable.action}`,
      domain: persistable.domain,
      status: persistable.status,
      userId: persistable.userId,
      targetId: persistable.targetId,
      requestId: persistable.requestId ?? undefined,
      details: persistable.details ?? undefined,
    });

    void persistAuditEvent(persistable).catch((error) => {
      if (!persistenceWarningLogged) {
        persistenceWarningLogged = true;
        writeTechnicalLog({
          event: "audit.persistence_failed",
          level: "warn",
          source: "audit",
          requestId: persistable.requestId ?? undefined,
          data: {
            domain: persistable.domain,
            action: persistable.action,
            status: persistable.status,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    });
  } catch (error) {
    writeTechnicalLog({
      event: "audit.write_failed",
      level: "warn",
      source: "audit",
      data: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

export function buildPersistableAuditEventForTests(event: AuditEvent): PersistableAuditEvent {
  return toPersistableEvent(event);
}
