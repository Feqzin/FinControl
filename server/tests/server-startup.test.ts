import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "http";
import { startHttpServer } from "../server-startup";

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test("inicia no host/porta preferidos quando estao disponiveis", async () => {
  const server = createServer();

  try {
    const started = await startHttpServer(server, {
      preferredHost: "127.0.0.1",
      preferredPort: 0,
      nodeEnv: "development",
    });

    assert.equal(started.host, "127.0.0.1");
    assert.ok(started.port > 0);
  } finally {
    await closeServer(server);
  }
});

test("em desenvolvimento, usa porta alternativa quando a preferida esta ocupada", async () => {
  const occupied = createServer();
  const occupiedStarted = await startHttpServer(occupied, {
    preferredHost: "127.0.0.1",
    preferredPort: 0,
    nodeEnv: "development",
  });

  const server = createServer();

  try {
    const started = await startHttpServer(server, {
      preferredHost: "127.0.0.1",
      preferredPort: occupiedStarted.port,
      nodeEnv: "development",
    });

    assert.notEqual(started.port, occupiedStarted.port);
  } finally {
    await closeServer(server);
    await closeServer(occupied);
  }
});

test("em producao, falha quando a porta preferida esta ocupada", async () => {
  const occupied = createServer();
  const occupiedStarted = await startHttpServer(occupied, {
    preferredHost: "127.0.0.1",
    preferredPort: 0,
    nodeEnv: "development",
  });

  const server = createServer();

  try {
    await assert.rejects(
      () =>
        startHttpServer(server, {
          preferredHost: "127.0.0.1",
          preferredPort: occupiedStarted.port,
          nodeEnv: "production",
        }),
      /EADDRINUSE/,
    );
  } finally {
    await closeServer(server).catch(() => {});
    await closeServer(occupied);
  }
});
