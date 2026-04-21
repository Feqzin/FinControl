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
  const message = err.message || "Internal Server Error";

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

  return res.status(status).json({ message });
});

export default app;
