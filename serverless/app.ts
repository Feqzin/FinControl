import express, { type NextFunction, type Request, type Response } from "express";
import { registerRoutes } from "./routes.js";
import {
  createRequestId,
  summarizeResponsePayload,
  toErrorLog,
  writeTechnicalLog,
} from "./logger.js";

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

const DATABASE_SCHEMA_ERROR_CODES = new Set(["42P01", "42703"]);

function extractErrorMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  return String(value ?? "");
}

function extractErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && code.trim()) return code.trim();

  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === "string" && causeCode.trim()) return causeCode.trim();
  }

  return null;
}

function isPessoaSaldoSchemaError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  const causeMessage = extractErrorMessage((error as { cause?: unknown })?.cause).toLowerCase();
  const joined = `${message}\n${causeMessage}`;
  const code = extractErrorCode(error);

  if (code && DATABASE_SCHEMA_ERROR_CODES.has(code) && joined.includes("pessoa_saldo_movimentacoes")) {
    return true;
  }

  if (!joined.includes("pessoa_saldo_movimentacoes")) {
    return false;
  }

  return joined.includes("does not exist")
    || joined.includes("undefined column")
    || joined.includes("coluna")
    || joined.includes("relation");
}

function buildSafeClientErrorMessage(error: unknown, status: number): string {
  if (status < 500) {
    const message = extractErrorMessage(error);
    return message || "Bad Request";
  }

  if (isPessoaSaldoSchemaError(error)) {
    return "Falha ao salvar movimentacao de saldo. Estrutura do banco desatualizada (coluna ou tabela ausente).";
  }

  return "Erro interno ao processar a requisicao.";
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

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = buildSafeClientErrorMessage(err, status);
  const payload =
    req.path === "/api/auth/me" && status >= 500
      ? {
          message: "Erro ao carregar sessao.",
          errorCode: "AUTH_ME_FAILED",
        }
      : { message };

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

export default app;
