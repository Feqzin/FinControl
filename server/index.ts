import { createServer } from "http";
import { app } from "./app";
import { serveStatic } from "./static";
import { seedDatabase } from "./seed";
import { ENV } from "./env";
import { startHttpServer } from "./server-startup";
import { toErrorLog, writeTechnicalLog } from "./logger";

const httpServer = createServer(app);

export function log(message: string, source = "server") {
  writeTechnicalLog({
    event: "message",
    source,
    data: { message },
  });
}

(async () => {
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
  }

  const started = await startHttpServer(httpServer, {
    preferredHost: "0.0.0.0",
    preferredPort: ENV.port,
    nodeEnv: ENV.nodeEnv,
    log: (message) => log(message, "server"),
  });

  log(`serving on ${started.host}:${started.port}`);
})();
