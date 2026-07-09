import { createServer } from "http";
import { app } from "./app";
import { serveStatic } from "./static";
import { seedDatabase } from "./seed";
import { ENV } from "./env";
import { startHttpServer } from "./server-startup";
import { toErrorLog, writeTechnicalLog } from "./logger";

const httpServer = createServer(app);
const shouldLogLifecycle = ENV.nodeEnv === "development";

export function log(message: string, source = "server") {
  writeTechnicalLog({
    event: "message",
    source,
    data: { message },
  });
}

function logLifecycle(event: string, data?: Record<string, unknown>) {
  if (!shouldLogLifecycle) return;

  const payload = data && Object.keys(data).length > 0 ? data : undefined;
  console.info(`[dev-server] ${event}`, payload ?? "");
  writeTechnicalLog({
    event,
    source: "server.lifecycle",
    data: payload ?? {},
  });
}

function attachLifecycleInstrumentation() {
  if (!shouldLogLifecycle) return;

  logLifecycle("server.routes.registered", {
    nodeEnv: ENV.nodeEnv,
    port: ENV.port,
  });

  httpServer.on("close", () => {
    logLifecycle("server.close");
  });

  httpServer.on("error", (error) => {
    logLifecycle("server.error", toErrorLog(error));
  });

  process.on("beforeExit", (code) => {
    logLifecycle("process.beforeExit", { code });
  });

  process.on("exit", (code) => {
    logLifecycle("process.exit", { code });
  });

  process.on("uncaughtException", (error) => {
    logLifecycle("process.uncaughtException", toErrorLog(error));
  });

  process.on("unhandledRejection", (reason) => {
    logLifecycle("process.unhandledRejection", toErrorLog(reason));
  });
}

attachLifecycleInstrumentation();

(async () => {
  logLifecycle("server.bootstrap.start");

  if (ENV.demoSeed.enabled) {
    seedDatabase({
      username: ENV.demoSeed.username,
      password: ENV.demoSeed.password,
    }).catch((err) => {
      writeTechnicalLog({
        event: "seed.error",
        source: "seed",
        level: "error",
        data: toErrorLog(err),
      });
    });
  } else {
    log("demo seed disabled", "seed");
  }

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
    logLifecycle("server.vite.configured");
  }

  logLifecycle("server.listen.start", {
    preferredHost: "0.0.0.0",
    preferredPort: ENV.port,
  });
  const started = await startHttpServer(httpServer, {
    preferredHost: "0.0.0.0",
    preferredPort: ENV.port,
    nodeEnv: ENV.nodeEnv,
    log: (message) => log(message, "server"),
  });

  logLifecycle("server.listen.callback", {
    host: started.host,
    port: started.port,
  });
  log(`serving on ${started.host}:${started.port}`);
})();
