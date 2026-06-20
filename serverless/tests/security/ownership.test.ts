import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { createCloudBackupsController } from "../../controllers/cloud-backups.controller";
import { createPagamentosTimelineController } from "../../controllers/pagamentos-timeline.controller";
import { DividasService } from "../../services/dividas.service";
import { PessoasService } from "../../services/pessoas.service";
import { createFinancialRepository } from "../../repositories/financial.repository";
import { shouldRunDbIntegrationTests } from "../../../server/tests/test-db-availability";
import { createSecurityTestUser } from "./test-user-seed";

const testOwnershipIntegration = (await shouldRunDbIntegrationTests()) ? test : test.skip;

type OwnershipFixture = {
  db: any;
  eq: (left: unknown, right: unknown) => unknown;
  and: (...conditions: unknown[]) => unknown;
  storage: any;
  cloudBackupsService: any;
  CloudBackupsServiceError: typeof Error;
  tables: {
    users: any;
    pessoas: any;
    dividas: any;
    cartoes: any;
    comprasCartao: any;
    parcelasCompra: any;
    userCloudBackups: any;
  };
  userA: { id: string };
  userB: { id: string };
  pessoaB: { id: string };
  dividaB: { id: string };
  cartaoB: { id: string };
  compraB: { id: string };
  parcelaB: { id: string };
  backupB: { id: string };
};

async function createOwnershipFixture(): Promise<OwnershipFixture> {
  const [{ db }, { storage }, schema, { eq, and }, backupsModule] = await Promise.all([
    import("../../db"),
    import("../../storage"),
    import("../../../shared/schema"),
    import("drizzle-orm"),
    import("../../services/cloud-backups.service"),
  ]);

  const {
    users,
    pessoas,
    dividas,
    cartoes,
    comprasCartao,
    parcelasCompra,
    userCloudBackups,
  } = schema;

  const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  const [userA] = await db.insert(users).values({
    username: `idor_a_${suffix}@test.local`,
    password: "hash_fake",
  }).returning();

  const [userB] = await db.insert(users).values({
    username: `idor_b_${suffix}@test.local`,
    password: "hash_fake",
  }).returning();

  const [pessoaB] = await db.insert(pessoas).values({
    userId: userB.id,
    nome: "Pessoa IDOR B",
    tipo: "me_deve",
    telefone: null,
    observacao: null,
  }).returning();

  const [dividaB] = await db.insert(dividas).values({
    userId: userB.id,
    pessoaId: pessoaB.id,
    tipo: "receber",
    valor: "94.38",
    dataVencimento: "2026-05-20",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Dívida IDOR B",
  }).returning();

  const [cartaoB] = await db.insert(cartoes).values({
    userId: userB.id,
    nome: "Cartao IDOR B",
    limite: "1000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
    iconeId: null,
  }).returning();

  const [compraB] = await db.insert(comprasCartao).values({
    userId: userB.id,
    cartaoId: cartaoB.id,
    descricao: "Compra IDOR B",
    valorTotal: "120.00",
    parcelas: 2,
    parcelaAtual: 1,
    valorParcela: "60.00",
    dataCompra: "2026-05-01",
    pessoaId: pessoaB.id,
    statusPessoa: null,
    dataPagamentoPessoa: null,
  }).returning();

  const [parcelaB] = await db.insert(parcelasCompra).values({
    userId: userB.id,
    compraCartaoId: compraB.id,
    numero: 1,
    valor: "60.00",
    dataVencimento: "2026-05-20",
    statusCartao: "pendente",
    dataPagamentoCartao: null,
    statusPessoa: null,
    dataPagamentoPessoa: null,
  }).returning();

  const [backupB] = await db.insert(userCloudBackups).values({
    userId: userB.id,
    filePath: `${userB.id}/idor-backup.json`,
    fileName: "idor-backup.json",
    sizeBytes: 2,
    sha256: "a".repeat(64),
    backupType: "manual",
    status: "completed",
    isEncrypted: false,
  }).returning();

  return {
    db,
    eq,
    and,
    storage,
    cloudBackupsService: new backupsModule.CloudBackupsService(),
    CloudBackupsServiceError: backupsModule.CloudBackupsServiceError,
    tables: {
      users,
      pessoas,
      dividas,
      cartoes,
      comprasCartao,
      parcelasCompra,
      userCloudBackups,
    },
    userA,
    userB,
    pessoaB,
    dividaB,
    cartaoB,
    compraB,
    parcelaB,
    backupB,
  };
}

async function cleanupOwnershipFixture(fixture: OwnershipFixture): Promise<void> {
  await fixture.db.delete(fixture.tables.users).where(fixture.eq(fixture.tables.users.id, fixture.userA.id));
  await fixture.db.delete(fixture.tables.users).where(fixture.eq(fixture.tables.users.id, fixture.userB.id));
}

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
  const testUser = await createSecurityTestUser("ownership_cloud_backup_download");
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

  try {
    const app = express();
    app.use((req, _res, next) => {
      (req as any).user = { id: testUser.id };
      next();
    });
    app.get("/api/backups/cloud/:id/download", controller.downloadById);

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/backups/cloud/backup_user_b/download`);
      assert.equal(response.status, 200);
      assert.equal(capturedUserId, testUser.id);
      assert.equal(capturedBackupId, "backup_user_b");
    });
  } finally {
    await testUser.cleanup();
  }
});

test("cloud backup preview usa userId da sessao (nao confia em input externo)", async () => {
  const testUser = await createSecurityTestUser("ownership_cloud_backup_preview");
  let capturedUserId: string | null = null;
  let capturedBackupId: string | null = null;

  const controller = createCloudBackupsController({
    previewById: async (userId: string, backupId: string) => {
      capturedUserId = userId;
      capturedBackupId = backupId;
      return {
        backupInfo: {
          fileName: "backup.json",
          createdAt: "2026-05-28T00:00:00.000Z",
          sizeBytes: 123,
          version: null,
        },
        modules: [],
        warnings: [],
      };
    },
  } as any);

  try {
    const app = express();
    app.use((req, _res, next) => {
      (req as any).user = { id: testUser.id };
      next();
    });
    app.post("/api/backups/cloud/:id/preview", controller.previewById);

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/backups/cloud/backup_user_b/preview`, { method: "POST" });
      assert.equal(response.status, 200);
      assert.equal(capturedUserId, testUser.id);
      assert.equal(capturedBackupId, "backup_user_b");
    });
  } finally {
    await testUser.cleanup();
  }
});

test("cloud backup delete usa userId da sessao e confirmationText do body", async () => {
  const testUser = await createSecurityTestUser("ownership_cloud_backup_delete");
  let capturedUserId: string | null = null;
  let capturedBackupId: string | null = null;
  let capturedConfirmationText: string | null = null;

  const controller = createCloudBackupsController({
    deleteById: async (userId: string, backupId: string, payload: { confirmationText?: string | null }) => {
      capturedUserId = userId;
      capturedBackupId = backupId;
      capturedConfirmationText = payload.confirmationText ?? null;
      return {
        success: true,
        backupId,
        fileName: "backup.json",
      };
    },
  } as any);

  try {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { id: testUser.id };
      next();
    });
    app.post("/api/backups/cloud/:id/delete", controller.deleteById);

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/backups/cloud/backup_user_b/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmationText: "backup.json" }),
      });
      assert.equal(response.status, 200);
      assert.equal(capturedUserId, testUser.id);
      assert.equal(capturedBackupId, "backup_user_b");
      assert.equal(capturedConfirmationText, "backup.json");
    });
  } finally {
    await testUser.cleanup();
  }
});

test("download de comprovante usa userId autenticado para checagem de ownership", async () => {
  const testUser = await createSecurityTestUser("ownership_comprovante_divida_download");
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

  try {
    const app = express();
    app.use((req, _res, next) => {
      (req as any).user = { id: testUser.id };
      next();
    });
    app.get("/api/pagamentos/:sourceType/:sourceId/comprovante", controller.getComprovante);

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/pagamentos/divida/divida_user_b/comprovante`);
      assert.equal(response.status, 404);
      assert.equal(capturedUserId, testUser.id);
      assert.equal(capturedSourceType, "divida");
      assert.equal(capturedSourceId, "divida_user_b");
    });
  } finally {
    await testUser.cleanup();
  }
});

test("download de comprovante de parcela_compra usa userId autenticado", async () => {
  const testUser = await createSecurityTestUser("ownership_comprovante_parcela_compra_download");
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

  try {
    const app = express();
    app.use((req, _res, next) => {
      (req as any).user = { id: testUser.id };
      next();
    });
    app.get("/api/pagamentos/:sourceType/:sourceId/comprovante", controller.getComprovante);

    await withTestServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/pagamentos/parcela_compra/parcela_compra_user_b/comprovante`);
      assert.equal(response.status, 404);
      assert.equal(capturedUserId, testUser.id);
      assert.equal(capturedSourceType, "parcela_compra");
      assert.equal(capturedSourceId, "parcela_compra_user_b");
    });
  } finally {
    await testUser.cleanup();
  }
});

testOwnershipIntegration("IDOR integração: usuário A não acessa, edita ou exclui pessoa do usuário B", async () => {
  const fixture = await createOwnershipFixture();

  try {
    const fromA = await fixture.storage.getPessoa(fixture.pessoaB.id, fixture.userA.id);
    assert.equal(fromA, undefined);

    const updatedByA = await fixture.storage.updatePessoa(fixture.pessoaB.id, fixture.userA.id, {
      observacao: "tentativa-invalida",
    });
    assert.equal(updatedByA, undefined);

    const deletedByA = await fixture.storage.deletePessoa(fixture.pessoaB.id, fixture.userA.id);
    assert.equal(deletedByA, false);

    const restoredByA = await fixture.storage.restorePessoa(fixture.pessoaB.id, fixture.userA.id);
    assert.equal(restoredByA, undefined);

    const [stillOwnedByB] = await fixture.db.select().from(fixture.tables.pessoas).where(
      fixture.and(
        fixture.eq(fixture.tables.pessoas.id, fixture.pessoaB.id),
        fixture.eq(fixture.tables.pessoas.userId, fixture.userB.id),
      ),
    );
    assert.ok(stillOwnedByB);
  } finally {
    await cleanupOwnershipFixture(fixture);
  }
});

testOwnershipIntegration("soft delete pessoa: remover move para removidas e restaurar devolve para ativas", async () => {
  const fixture = await createOwnershipFixture();

  try {
    const pessoasAtivasAntes = await fixture.storage.getPessoasByStatus(fixture.userB.id, "active");
    assert.ok(pessoasAtivasAntes.some((row: { id: string }) => row.id === fixture.pessoaB.id));

    const deleted = await fixture.storage.deletePessoa(fixture.pessoaB.id, fixture.userB.id);
    assert.equal(deleted, true);

    const pessoasAtivasDepoisDelete = await fixture.storage.getPessoasByStatus(fixture.userB.id, "active");
    assert.equal(
      pessoasAtivasDepoisDelete.some((row: { id: string }) => row.id === fixture.pessoaB.id),
      false,
    );

    const pessoasRemovidas = await fixture.storage.getPessoasByStatus(fixture.userB.id, "removed");
    assert.equal(
      pessoasRemovidas.some((row: { id: string }) => row.id === fixture.pessoaB.id),
      true,
    );

    const restored = await fixture.storage.restorePessoa(fixture.pessoaB.id, fixture.userB.id);
    assert.ok(restored);

    const pessoasAtivasDepoisRestore = await fixture.storage.getPessoasByStatus(fixture.userB.id, "active");
    assert.equal(
      pessoasAtivasDepoisRestore.some((row: { id: string }) => row.id === fixture.pessoaB.id),
      true,
    );
  } finally {
    await cleanupOwnershipFixture(fixture);
  }
});

testOwnershipIntegration("soft delete dívida: remover move para removidas e restaurar devolve para ativas", async () => {
  const fixture = await createOwnershipFixture();
  const service = new DividasService(createFinancialRepository(fixture.storage));

  try {
    const dividasAtivasAntes = await service.list(fixture.userB.id, "active");
    assert.equal(dividasAtivasAntes.some((row) => row.id === fixture.dividaB.id), true);

    const deleted = await service.delete(fixture.dividaB.id, fixture.userB.id);
    assert.equal(deleted, true);

    const dividasAtivasDepoisDelete = await service.list(fixture.userB.id, "active");
    assert.equal(
      dividasAtivasDepoisDelete.some((row) => row.id === fixture.dividaB.id),
      false,
    );

    const dividasRemovidas = await service.list(fixture.userB.id, "removed");
    assert.equal(
      dividasRemovidas.some((row) => row.id === fixture.dividaB.id),
      true,
    );

    const restoredByA = await service.restore(fixture.dividaB.id, fixture.userA.id);
    assert.equal(restoredByA, undefined);

    const restoredByOwner = await service.restore(fixture.dividaB.id, fixture.userB.id);
    assert.ok(restoredByOwner);
    assert.equal(restoredByOwner.id, fixture.dividaB.id);
  } finally {
    await cleanupOwnershipFixture(fixture);
  }
});

testOwnershipIntegration("dívida permanente: exige remoção prévia e respeita ownership", async () => {
  const fixture = await createOwnershipFixture();
  const service = new DividasService(createFinancialRepository(fixture.storage));

  try {
    const blockedActive = await service.deletePermanent(fixture.dividaB.id, fixture.userB.id);
    assert.deepEqual(blockedActive, { error: "DIVIDA_ATIVA" });

    const softDeleted = await service.delete(fixture.dividaB.id, fixture.userB.id);
    assert.equal(softDeleted, true);

    const blockedOwnership = await service.deletePermanent(fixture.dividaB.id, fixture.userA.id);
    assert.deepEqual(blockedOwnership, { error: "NOT_FOUND" });

    const deletedByOwner = await service.deletePermanent(fixture.dividaB.id, fixture.userB.id);
    assert.deepEqual(deletedByOwner, { ok: true });

    const dividaPersistida = await fixture.storage.getDivida(fixture.dividaB.id, fixture.userB.id);
    assert.equal(dividaPersistida, undefined);
  } finally {
    await cleanupOwnershipFixture(fixture);
  }
});

testOwnershipIntegration("pessoa permanente: bloqueia com vínculos e permite sem vínculos", async () => {
  const fixture = await createOwnershipFixture();
  const service = new PessoasService(fixture.storage);

  try {
    const removedWithLinks = await fixture.storage.deletePessoa(fixture.pessoaB.id, fixture.userB.id);
    assert.equal(removedWithLinks, true);

    const blockedWithLinks = await service.deletePermanent(fixture.pessoaB.id, fixture.userB.id);
    assert.deepEqual(blockedWithLinks, { error: "PESSOA_COM_VINCULOS" });

    const blockedOwnership = await service.deletePermanent(fixture.pessoaB.id, fixture.userA.id);
    assert.deepEqual(blockedOwnership, { error: "NOT_FOUND" });

    const pessoaSemVinculos = await fixture.storage.createPessoa({
      userId: fixture.userB.id,
      nome: "Pessoa sem vínculos",
      tipo: "me_deve",
      telefone: null,
      observacao: null,
    });

    const removedSemVinculos = await fixture.storage.deletePessoa(pessoaSemVinculos.id, fixture.userB.id);
    assert.equal(removedSemVinculos, true);

    const deletedSemVinculos = await service.deletePermanent(pessoaSemVinculos.id, fixture.userB.id);
    assert.deepEqual(deletedSemVinculos, { ok: true });

    const pessoaPersistida = await fixture.storage.getPessoa(pessoaSemVinculos.id, fixture.userB.id);
    assert.equal(pessoaPersistida, undefined);
  } finally {
    await cleanupOwnershipFixture(fixture);
  }
});

testOwnershipIntegration("IDOR integração: usuário A não acessa, edita ou exclui cartão do usuário B", async () => {
  const fixture = await createOwnershipFixture();

  try {
    const fromA = await fixture.storage.getCartao(fixture.cartaoB.id, fixture.userA.id);
    assert.equal(fromA, undefined);

    const updatedByA = await fixture.storage.updateCartao(fixture.cartaoB.id, fixture.userA.id, {
      nome: "cartao-nao-autorizado",
    });
    assert.equal(updatedByA, undefined);

    const deletedByA = await fixture.storage.deleteCartao(fixture.cartaoB.id, fixture.userA.id);
    assert.equal(deletedByA, false);

    const [stillOwnedByB] = await fixture.db.select().from(fixture.tables.cartoes).where(
      fixture.and(
        fixture.eq(fixture.tables.cartoes.id, fixture.cartaoB.id),
        fixture.eq(fixture.tables.cartoes.userId, fixture.userB.id),
      ),
    );
    assert.ok(stillOwnedByB);
  } finally {
    await cleanupOwnershipFixture(fixture);
  }
});

testOwnershipIntegration("IDOR integração: usuário A não acessa, edita ou exclui compra do usuário B", async () => {
  const fixture = await createOwnershipFixture();

  try {
    const fromA = await fixture.storage.getCompraCartao(fixture.compraB.id, fixture.userA.id);
    assert.equal(fromA, undefined);

    const updatedByA = await fixture.storage.updateCompraCartao(fixture.compraB.id, fixture.userA.id, {
      descricao: "compra-nao-autorizada",
    });
    assert.equal(updatedByA, undefined);

    const deletedByA = await fixture.storage.deleteCompraCartao(fixture.compraB.id, fixture.userA.id);
    assert.equal(deletedByA, false);

    const [stillOwnedByB] = await fixture.db.select().from(fixture.tables.comprasCartao).where(
      fixture.and(
        fixture.eq(fixture.tables.comprasCartao.id, fixture.compraB.id),
        fixture.eq(fixture.tables.comprasCartao.userId, fixture.userB.id),
      ),
    );
    assert.ok(stillOwnedByB);
  } finally {
    await cleanupOwnershipFixture(fixture);
  }
});

testOwnershipIntegration("IDOR integração: usuário A não acessa, edita ou exclui parcela do usuário B", async () => {
  const fixture = await createOwnershipFixture();

  try {
    const fromA = await fixture.storage.getParcelaCompraById(fixture.parcelaB.id, fixture.userA.id);
    assert.equal(fromA, undefined);

    const updatedByA = await fixture.storage.updateParcelaCompra(fixture.parcelaB.id, fixture.userA.id, {
      statusCartao: "pago",
    });
    assert.equal(updatedByA, undefined);

    const deletedByA = await fixture.storage.deleteParcelaCompra(fixture.parcelaB.id, fixture.userA.id);
    assert.equal(deletedByA, false);

    const [stillOwnedByB] = await fixture.db.select().from(fixture.tables.parcelasCompra).where(
      fixture.and(
        fixture.eq(fixture.tables.parcelasCompra.id, fixture.parcelaB.id),
        fixture.eq(fixture.tables.parcelasCompra.userId, fixture.userB.id),
      ),
    );
    assert.ok(stillOwnedByB);
  } finally {
    await cleanupOwnershipFixture(fixture);
  }
});

testOwnershipIntegration("IDOR integração: usuário A não lista nem baixa backup do usuário B", async () => {
  const fixture = await createOwnershipFixture();

  try {
    const listFromA = await fixture.cloudBackupsService.listByUser(fixture.userA.id, 20);
    assert.equal(listFromA.some((item: { id: string }) => item.id === fixture.backupB.id), false);

    await assert.rejects(
      fixture.cloudBackupsService.downloadById(fixture.userA.id, fixture.backupB.id),
      (error: unknown) => {
        assert.ok(error instanceof fixture.CloudBackupsServiceError);
        assert.equal((error as { status: number }).status, 404);
        assert.equal((error as { message: string }).message, "Backup na nuvem nao encontrado.");
        return true;
      },
    );
  } finally {
    await cleanupOwnershipFixture(fixture);
  }
});

testOwnershipIntegration("IDOR integração: usuário A não exclui backup do usuário B", async () => {
  const fixture = await createOwnershipFixture();

  try {
    await assert.rejects(
      fixture.cloudBackupsService.deleteById(fixture.userA.id, fixture.backupB.id, {
        confirmationText: "idor-backup.json",
      }),
      (error: unknown) => {
        assert.ok(error instanceof fixture.CloudBackupsServiceError);
        assert.equal((error as { status: number }).status, 404);
        assert.equal((error as { message: string }).message, "Backup na nuvem nao encontrado.");
        return true;
      },
    );

    const [stillOwnedByB] = await fixture.db.select().from(fixture.tables.userCloudBackups).where(
      fixture.and(
        fixture.eq(fixture.tables.userCloudBackups.id, fixture.backupB.id),
        fixture.eq(fixture.tables.userCloudBackups.userId, fixture.userB.id),
      ),
    );
    assert.ok(stillOwnedByB);
  } finally {
    await cleanupOwnershipFixture(fixture);
  }
});
