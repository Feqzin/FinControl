import express, { type NextFunction, type Request, type Response } from "express";
import { registerRoutes } from "./routes";
import {
  createRequestId,
  summarizeResponsePayload,
  toErrorLog,
  writeTechnicalLog,
} from "./logger";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
  }
}

const app = express();

function extractErrorMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  return String(value ?? "");
}

function extractErrorCode(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const direct = (value as { errorCode?: unknown }).errorCode;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const code = (value as { code?: unknown }).code;
  if (typeof code === "string" && code.trim()) return code.trim();
  const cause = (value as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeDirect = (cause as { errorCode?: unknown }).errorCode;
    if (typeof causeDirect === "string" && causeDirect.trim()) return causeDirect.trim();
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === "string" && causeCode.trim()) return causeCode.trim();
  }
  return null;
}

app.use(
  express.json({
    // Mantem margem para JSON/base64 e fica abaixo do limite de payload da Vercel Functions.
    limit: "4.2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const requestId = createRequestId(req.headers["x-request-id"]);
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: unknown = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const responseSummary = summarizeResponsePayload(capturedJsonResponse);
      writeTechnicalLog({
        event: "http.request.completed",
        source: "express",
        requestId: req.requestId,
        level: res.statusCode >= 500 ? "error" : "info",
        data: {
          method: req.method,
          path,
          statusCode: res.statusCode,
          durationMs: duration,
          responseSize: res.getHeader("content-length") ?? null,
          responseSummary,
        },
      });
    }
  });

  next();
});

registerRoutes(app);

app.use("/api", (_req, res) => {
  return res.status(404).json({ message: "Route not found" });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const defaultMessage =
    status < 500
      ? extractErrorMessage(err) || "Bad Request"
      : "Erro interno ao processar a requisicao.";
  const errorCode = extractErrorCode(err);
  const payload =
    req.path === "/api/auth/me" && status >= 500
      ? {
          message: "Erro ao carregar sessao.",
          errorCode: "AUTH_ME_FAILED",
        }
      : errorCode
        ? { message: defaultMessage, errorCode }
        : { message: defaultMessage };

  writeTechnicalLog({
    event: "http.request.error",
    source: "express",
    level: "error",
    requestId: req.requestId,
    data: {
      method: req.method,
      path: req.path,
      statusCode: status,
      error: toErrorLog(err),
    },
  });

  if (res.headersSent) {
    return next(err);
  }

  return res.status(status).json(payload);
});

export { app };
