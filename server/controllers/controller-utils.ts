import type { Request } from "express";
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
  });
}
