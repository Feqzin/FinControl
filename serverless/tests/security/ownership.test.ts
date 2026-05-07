import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { createCloudBackupsController } from "../../controllers/cloud-backups.controller";
import { createPagamentosTimelineController } from "../../controllers/pagamentos-timeline.controller";

async function withTestServer(
  app: ReturnType<typeof express>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("cloud backup download usa userId da sessao (nao confia em input externo)", async () => {
  let capturedUserId: string | null = null;
  let capturedBackupId: string | null = null;

  const controller = createCloudBackupsController({
    downloadById: async (userId: string, backupId: string) => {
      capturedUserId = userId;
      capturedBackupId = backupId;
      return {
        fileName: "backup.json",
        content: Buffer.from("{}"),
      };
    },
  } as any);

  const app = express();
  app.use((req, _res, next) => {
    (req as any).user = { id: "user_a" };
    next();
  });
  app.get("/api/backups/cloud/:id/download", controller.downloadById);

  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/backups/cloud/backup_user_b/download`);
    assert.equal(response.status, 200);
    assert.equal(capturedUserId, "user_a");
    assert.equal(capturedBackupId, "backup_user_b");
  });
});

test("download de comprovante usa userId autenticado para checagem de ownership", async () => {
  let capturedUserId: string | null = null;
  let capturedSourceType: string | null = null;
  let capturedSourceId: string | null = null;

  const controller = createPagamentosTimelineController({
    getComprovanteDownload: async (sourceType: string, sourceId: string, userId: string) => {
      capturedSourceType = sourceType;
      capturedSourceId = sourceId;
      capturedUserId = userId;
      return { error: "NOT_FOUND" as const };
    },
  } as any);

  const app = express();
  app.use((req, _res, next) => {
    (req as any).user = { id: "user_a" };
    next();
  });
  app.get("/api/pagamentos/:sourceType/:sourceId/comprovante", controller.getComprovante);

  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/pagamentos/divida/divida_user_b/comprovante`);
    assert.equal(response.status, 404);
    assert.equal(capturedUserId, "user_a");
    assert.equal(capturedSourceType, "divida");
    assert.equal(capturedSourceId, "divida_user_b");
  });
});

test.todo("IDOR integração: usuário A não deve acessar pessoa do usuário B (requer seed/db de teste dedicado)");
test.todo("IDOR integração: usuário A não deve acessar cartão do usuário B (requer seed/db de teste dedicado)");
test.todo("IDOR integração: usuário A não deve acessar compra de cartão do usuário B (requer seed/db de teste dedicado)");
test.todo("IDOR integração: usuário A não deve acessar parcela do usuário B (requer seed/db de teste dedicado)");
test.todo("IDOR integração: usuário A não deve listar/baixar backup do usuário B (requer seed/db de teste dedicado)");
