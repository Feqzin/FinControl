import type { Request, Response } from "express";
import { ENV } from "../env.js";
import { writeTechnicalLog } from "../logger.js";

type DebugRouteAccess =
  | { allowed: true; isProduction: boolean }
  | { allowed: false; isProduction: boolean };

const DEBUG_NOT_FOUND_RESPONSE = { error: "Not found" };
const DEBUG_UNAVAILABLE_RESPONSE = { error: "Endpoint unavailable" };
const DEBUG_TOKEN_MIN_LENGTH = 24;

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isStrongToken(token: string): boolean {
  return token.length >= DEBUG_TOKEN_MIN_LENGTH;
}

function sendNotFound(res: Response): DebugRouteAccess {
  res.status(404).json(DEBUG_NOT_FOUND_RESPONSE);
  return { allowed: false, isProduction: true };
}

export function sendDebugUnavailable(res: Response): void {
  res.status(503).json(DEBUG_UNAVAILABLE_RESPONSE);
}

export function guardDebugRouteAccess(req: Request, res: Response, routeName: string): DebugRouteAccess {
  const isProduction = ENV.nodeEnv === "production";
  if (!isProduction) {
    return { allowed: true, isProduction: false };
  }

  const debugEnabled = parseBooleanFlag(process.env.DEBUG_DB_CHECK_ENABLED);
  const configuredToken = process.env.DEBUG_DB_CHECK_TOKEN?.trim() ?? "";

  if (!debugEnabled || !isStrongToken(configuredToken)) {
    writeTechnicalLog({
      event: "debug.route.blocked",
      source: "debug-route-guard",
      level: "warn",
      requestId: req.requestId,
      data: {
        routeName,
        reason: !debugEnabled ? "disabled_in_production" : "weak_or_missing_token",
      },
    });
    return sendNotFound(res);
  }

  const providedToken = req.get("x-debug-token")?.trim() ?? "";
  if (!providedToken || providedToken !== configuredToken) {
    writeTechnicalLog({
      event: "debug.route.blocked",
      source: "debug-route-guard",
      level: "warn",
      requestId: req.requestId,
      data: {
        routeName,
        reason: "invalid_token",
      },
    });
    return sendNotFound(res);
  }

  return { allowed: true, isProduction: true };
}

