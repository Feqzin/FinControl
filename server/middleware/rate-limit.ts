import type { Request } from "express";
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import { writeTechnicalLog } from "../logger";

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    return fallback;
  }
  return parsed;
}

function sanitizeForwardedIp(ip: string): string {
  const trimmed = ip.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    if (end > 0) return trimmed.slice(1, end);
    return trimmed;
  }
  const parts = trimmed.split(":");
  if (parts.length === 2 && /^\d+$/.test(parts[1]) && parts[0].includes(".")) {
    return parts[0];
  }
  return trimmed;
}

function getClientIp(req: Request): string {
  const xForwardedFor = req.headers["x-forwarded-for"];
  if (typeof xForwardedFor === "string" && xForwardedFor.trim()) {
    const candidate = xForwardedFor.split(",")[0]?.trim();
    if (candidate) return sanitizeForwardedIp(candidate);
  }
  if (Array.isArray(xForwardedFor) && xForwardedFor.length > 0) {
    const candidate = xForwardedFor[0]?.trim();
    if (candidate) return sanitizeForwardedIp(candidate);
  }
  if (typeof req.ip === "string" && req.ip.trim()) {
    return sanitizeForwardedIp(req.ip);
  }
  const socketAddress = req.socket?.remoteAddress;
  if (typeof socketAddress === "string" && socketAddress.trim()) {
    return sanitizeForwardedIp(socketAddress);
  }
  return "unknown";
}

function maskIp(ip: string): string {
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.x.x`;
    }
  }
  if (ip.includes(":")) {
    const parts = ip.split(":").filter(Boolean);
    return `${parts.slice(0, 2).join(":")}::`;
  }
  return "unknown";
}

function getRateLimitKey(req: Request): string {
  const userId = typeof (req.user as { id?: unknown } | undefined)?.id === "string"
    ? (req.user as { id: string }).id
    : null;
  const ip = getClientIp(req);
  const subject = userId ? `user:${userId}` : "user:anon";
  return `import:${subject}:ip:${ip}`;
}

function createImportRateLimit(): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parsePositiveIntEnv("RATE_LIMIT_IMPORT_MAX", 10),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getRateLimitKey(req),
    handler: (req, res) => {
      const rawIp = getClientIp(req);
      const userId = typeof (req.user as { id?: unknown } | undefined)?.id === "string"
        ? (req.user as { id: string }).id
        : null;

      writeTechnicalLog({
        event: "rate_limit.blocked",
        source: "rate-limit-middleware",
        level: "warn",
        requestId: req.requestId,
        data: {
          group: "import",
          route: req.path,
          method: req.method,
          userId,
          ipMasked: maskIp(rawIp),
        },
      });

      res.status(429).json({ error: "Too many requests" });
    },
  });
}

export const importRateLimit = createImportRateLimit();
