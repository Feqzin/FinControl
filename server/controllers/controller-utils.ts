import type { Request, Response } from "express";
import { writeAuditLog, type AuditEvent } from "../audit-log";

export function getUserId(req: Request): string {
  return (req.user as any).id;
}

export function getParam(req: Request, key: string): string {
  const value = req.params[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function auditRequest(
  req: Request,
  event: Omit<AuditEvent, "method" | "route">,
): void {
  writeAuditLog({
    ...event,
    method: req.method,
    route: req.path,
    requestId: req.requestId ?? null,
    requestIp: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  });
}

export function sendBadRequest(res: Response, message: string) {
  return res.status(400).json({ message });
}

export function sendNotFound(res: Response, message = "Not found") {
  return res.status(404).json({ message });
}
