import { randomUUID } from "node:crypto";

type Primitive = string | number | boolean | null | undefined;
export type JsonLike = Primitive | JsonLike[] | { [key: string]: JsonLike };

type SanitizeOptions = {
  redactFinancial?: boolean;
  dropHeavyPayloads?: boolean;
  maxDepth?: number;
  maxArrayLength?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
};

const DEFAULT_SANITIZE_OPTIONS: Required<SanitizeOptions> = {
  redactFinancial: false,
  dropHeavyPayloads: false,
  maxDepth: 4,
  maxArrayLength: 20,
  maxObjectKeys: 30,
  maxStringLength: 220,
};

const SENSITIVE_KEY_PARTS = [
  "password",
  "token",
  "authorization",
  "cookie",
  "secret",
  "resetlink",
  "sessionid",
  "apikey",
  "api_key",
  "jwt",
  "passphrase",
];

const FINANCIAL_KEY_PARTS = [
  "valor",
  "saldo",
  "limite",
  "montante",
  "renda",
  "patrimonio",
];

const HEAVY_KEY_PARTS = [
  "payload",
  "details",
  "request",
  "response",
  "body",
  "headers",
  "preview",
  "confirmed",
  "rollback",
  "items",
];

function redactSensitiveText(value: string): string {
  return value
    .replace(
      /(authorization:?\s*bearer\s+)[a-z0-9._~+/=-]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /\b(bearer)\s+[a-z0-9._~+/=-]+\b/gi,
      "$1 [REDACTED]",
    )
    .replace(
      /([?&](?:token|access_token|refresh_token|reset_token|password|secret)=)[^&\s]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /(\b(?:token|access_token|refresh_token|reset_token|password|secret)\s*=\s*)[^\s&]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /(["']?(?:password|token|accessToken|refreshToken|resetToken|cookie|secret|sessionId)["']?\s*:\s*)("[^"]*"|'[^']*'|[^,\s}]+)/gi,
      "$1\"[REDACTED]\"",
    )
    .replace(
      /(set-cookie:\s*)[^;\n]+/gi,
      "$1[REDACTED]",
    );
}

function truncateString(value: string, maxLength: number): string {
  const redacted = redactSensitiveText(value);
  if (redacted.length <= maxLength) return redacted;
  return `${redacted.slice(0, maxLength)}...[TRUNCATED:${redacted.length - maxLength}]`;
}

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((entry) => entry && entry.trim());
    return first?.trim();
  }
  return undefined;
}

function containsPart(key: string, parts: string[]): boolean {
  const normalized = key.toLowerCase();
  return parts.some((part) => normalized.includes(part));
}

function sanitizeInternal(
  value: unknown,
  options: Required<SanitizeOptions>,
  depth: number,
): JsonLike {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return truncateString(value, options.maxStringLength);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (depth >= options.maxDepth) {
    return "[OMITTED_DEPTH]";
  }

  if (Array.isArray(value)) {
    const slice = value.slice(0, options.maxArrayLength).map((entry) => sanitizeInternal(entry, options, depth + 1));
    if (value.length > options.maxArrayLength) {
      slice.push(`[OMITTED_ITEMS:${value.length - options.maxArrayLength}]`);
    }
    return slice;
  }

  if (typeof value !== "object") {
    return truncateString(String(value), options.maxStringLength);
  }

  const entries = Object.entries(value as Record<string, unknown>);
  const limitedEntries = entries.slice(0, options.maxObjectKeys);
  const out: Record<string, JsonLike> = {};

  for (const [key, child] of limitedEntries) {
    if (containsPart(key, SENSITIVE_KEY_PARTS)) {
      out[key] = "[REDACTED]";
      continue;
    }

    if (options.redactFinancial && containsPart(key, FINANCIAL_KEY_PARTS)) {
      out[key] = "[REDACTED_FINANCIAL]";
      continue;
    }

    if (options.dropHeavyPayloads && containsPart(key, HEAVY_KEY_PARTS)) {
      if (Array.isArray(child)) {
        out[key] = `[OMITTED_ARRAY:${child.length}]`;
      } else if (child && typeof child === "object") {
        out[key] = `[OMITTED_OBJECT_KEYS:${Object.keys(child as Record<string, unknown>).length}]`;
      } else {
        out[key] = "[OMITTED]";
      }
      continue;
    }

    out[key] = sanitizeInternal(child, options, depth + 1);
  }

  if (entries.length > options.maxObjectKeys) {
    out._omittedKeys = `[OMITTED_KEYS:${entries.length - options.maxObjectKeys}]`;
  }

  return out;
}

export function sanitizeForLog(value: unknown, options?: SanitizeOptions): JsonLike {
  const merged = { ...DEFAULT_SANITIZE_OPTIONS, ...(options ?? {}) };
  return sanitizeInternal(value, merged, 0);
}

export function createRequestId(headerValue: string | string[] | undefined): string {
  const fromHeader = normalizeHeaderValue(headerValue);
  if (fromHeader) return truncateString(fromHeader, 128);
  return randomUUID();
}

export function summarizeResponsePayload(payload: unknown): Record<string, JsonLike> {
  if (payload === undefined) return { responseType: "none" };
  if (payload === null) return { responseType: "null" };
  if (Array.isArray(payload)) {
    return {
      responseType: "array",
      itemCount: payload.length,
    };
  }
  if (typeof payload === "object") {
    const keys = Object.keys(payload as Record<string, unknown>);
    return {
      responseType: "object",
      keyCount: keys.length,
      keys: keys.slice(0, 12),
    };
  }
  return {
    responseType: typeof payload,
  };
}

export function toErrorLog(error: unknown): Record<string, JsonLike> {
  if (error instanceof Error) {
    const stack = typeof error.stack === "string"
      ? error.stack.split("\n").slice(0, 4).join("\n")
      : undefined;
    return sanitizeForLog(
      {
        name: error.name,
        message: error.message,
        stack,
        code: (error as { code?: unknown }).code ?? null,
      },
      {
        redactFinancial: true,
        dropHeavyPayloads: true,
        maxStringLength: 600,
      },
    ) as Record<string, JsonLike>;
  }

  return {
    message: truncateString(String(error), 600),
  };
}

type TechnicalLogInput = {
  event: string;
  level?: "info" | "warn" | "error";
  source?: string;
  requestId?: string;
  data?: Record<string, unknown>;
};

type BusinessLogInput = {
  event: string;
  domain: string;
  status: "success" | "failure" | "error";
  userId?: string | null;
  targetId?: string | null;
  requestId?: string;
  details?: unknown;
};

export function writeTechnicalLog(input: TechnicalLogInput): void {
  const payload = {
    type: "technical",
    timestamp: new Date().toISOString(),
    level: input.level ?? "info",
    source: input.source ?? "server",
    event: input.event,
    requestId: input.requestId,
    data: input.data ? sanitizeForLog(input.data, {
      redactFinancial: true,
      dropHeavyPayloads: true,
      maxStringLength: 500,
    }) : undefined,
  };

  console.log(JSON.stringify(payload));
}

export function writeBusinessLog(input: BusinessLogInput): void {
  const payload = {
    type: "business",
    timestamp: new Date().toISOString(),
    event: input.event,
    domain: input.domain,
    status: input.status,
    userId: input.userId ?? null,
    targetId: input.targetId ?? null,
    requestId: input.requestId,
    details: input.details
      ? sanitizeForLog(input.details, {
        redactFinancial: true,
        dropHeavyPayloads: true,
      })
      : undefined,
  };

  console.log(JSON.stringify(payload));
}
