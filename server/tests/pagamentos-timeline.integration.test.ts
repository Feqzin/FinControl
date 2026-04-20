import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { shouldRunDbIntegrationTests } from "./test-db-availability";

const testTimelineIntegration = (await shouldRunDbIntegrationTests()) ? test : test.skip;

testTimelineIntegration("timeline lista historico completo (pago, vencido e pendente) da pessoa", async () => {
  const expressModule = await import("express");
  const express = expressModule.default;
  const { db } = await import("../db");
  const { users, pessoas, dividas, parcelas } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { PagamentosTimelineService } = await import("../services/pagamentos-timeline.service");
  const { createPagamentosTimelineController } = await import("../controllers/pagamentos-timeline.controller");

  const username = `it_timeline_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const [user] = await db.insert(users).values({
    username,
    password: "hash_fake",
    nomeCompleto: "Timeline Integration",
  }).returning();

  const [pessoa] = await db.insert(pessoas).values({
    userId: user.id,
    nome: "Pessoa Timeline",
    tipo: "me_deve",
    telefone: null,
    observacao: null,
  }).returning();

  const [dividaParcelada] = await db.insert(dividas).values({
    userId: user.id,
    pessoaId: pessoa.id,
    tipo: "receber",
    valor: "300.00",
    valorTotal: "300.00",
    totalParcelas: 3,
    dataVencimento: "2026-03-10",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Parcelada timeline",
  }).returning();

  const [dividaPaga] = await db.insert(dividas).values({
    userId: user.id,
    pessoaId: pessoa.id,
    tipo: "receber",
    valor: "50.00",
    valorTotal: null,
    totalParcelas: null,
    dataVencimento: "2026-04-01",
    status: "pago",
    dataPagamento: "2026-04-02",
    formaPagamento: "pix",
    descricao: "Dívida simples paga",
  }).returning();

  const [dividaVencida] = await db.insert(dividas).values({
    userId: user.id,
    pessoaId: pessoa.id,
    tipo: "receber",
    valor: "80.00",
    valorTotal: null,
    totalParcelas: null,
    dataVencimento: "2026-01-05",
    status: "pendente",
    dataPagamento: null,
    formaPagamento: null,
    descricao: "Dívida simples vencida",
  }).returning();

  await db.insert(parcelas).values([
    {
      userId: user.id,
      dividaId: dividaParcelada.id,
      numero: 1,
      valor: "100.00",
      dataVencimento: "2026-03-10",
      status: "pago",
      dataPagamento: "2026-03-11",
      formaPagamento: "pix",
      observacaoPagamento: null,
      comprovantePath: null,
      comprovanteNome: null,
      comprovanteMimeType: null,
      comprovanteTamanho: null,
      comprovanteEnviadoEm: null,
    },
    {
      userId: user.id,
      dividaId: dividaParcelada.id,
      numero: 2,
      valor: "100.00",
      dataVencimento: "2026-02-10",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
      observacaoPagamento: null,
      comprovantePath: null,
      comprovanteNome: null,
      comprovanteMimeType: null,
      comprovanteTamanho: null,
      comprovanteEnviadoEm: null,
    },
    {
      userId: user.id,
      dividaId: dividaParcelada.id,
      numero: 3,
      valor: "100.00",
      dataVencimento: "2099-01-10",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
      observacaoPagamento: null,
      comprovantePath: null,
      comprovanteNome: null,
      comprovanteMimeType: null,
      comprovanteTamanho: null,
      comprovanteEnviadoEm: null,
    },
  ]);

  const app = express();
  app.use(express.json({ limit: "8mb" }));
  app.use((req, _res, next) => {
    (req as any).user = { id: user.id };
    next();
  });

  const controller = createPagamentosTimelineController(new PagamentosTimelineService(financialRepository));
  app.get("/api/pessoas/:pessoaId/timeline-pagamentos", controller.listByPessoa);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const response = await fetch(`${baseUrl}/api/pessoas/${pessoa.id}/timeline-pagamentos`);
    assert.equal(response.status, 200);
    const body = await response.json() as Array<{
      id: string;
      sourceType: "parcela" | "divida";
      status: "pago" | "vencido" | "pendente";
      dataEvento: string;
      valor: string;
    }>;

    assert.equal(body.length, 5);
    assert.deepEqual(
      body.map((event) => ({ sourceType: event.sourceType, status: event.status })),
      [
        { sourceType: "parcela", status: "pendente" },
        { sourceType: "divida", status: "pago" },
        { sourceType: "parcela", status: "pago" },
        { sourceType: "parcela", status: "vencido" },
        { sourceType: "divida", status: "vencido" },
      ],
    );

    assert.ok(body.every((event) => event.dataEvento));
    assert.ok(body.every((event) => Number(event.valor) > 0));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await db.delete(users).where(eq(users.id, user.id));
  }
});

testTimelineIntegration("observacao e comprovante ficam vinculados ao pagamento correto e respeitam userId", async () => {
  const expressModule = await import("express");
  const express = expressModule.default;
  const { db } = await import("../db");
  const { users, pessoas, dividas } = await import("@shared/schema");
  const { and, eq } = await import("drizzle-orm");
  const { financialRepository } = await import("../repositories/financial.repository");
  const { PagamentosTimelineService } = await import("../services/pagamentos-timeline.service");
  const { createPagamentosTimelineController } = await import("../controllers/pagamentos-timeline.controller");

  const usernameA = `it_timeline_owner_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const usernameB = `it_timeline_other_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const [owner] = await db.insert(users).values({
    username: usernameA,
    password: "hash_fake",
    nomeCompleto: "Timeline Owner",
  }).returning();

  const [other] = await db.insert(users).values({
    username: usernameB,
    password: "hash_fake",
    nomeCompleto: "Timeline Other",
  }).returning();

  const [pessoaOwner] = await db.insert(pessoas).values({
    userId: owner.id,
    nome: "Pessoa Owner",
    tipo: "me_deve",
    telefone: null,
    observacao: null,
  }).returning();

  const [dividaOwner] = await db.insert(dividas).values({
    userId: owner.id,
    pessoaId: pessoaOwner.id,
    tipo: "receber",
    valor: "120.00",
    valorTotal: null,
    totalParcelas: null,
    dataVencimento: "2026-03-20",
    status: "pago",
    dataPagamento: "2026-03-22",
    formaPagamento: "pix",
    descricao: "Divida com comprovante",
  }).returning();

  const app = express();
  app.use(express.json({ limit: "8mb" }));
  app.use((req, _res, next) => {
    const headerUser = req.headers["x-user-id"];
    const userId = Array.isArray(headerUser) ? headerUser[0] : headerUser;
    (req as any).user = { id: userId || owner.id };
    next();
  });

  const controller = createPagamentosTimelineController(new PagamentosTimelineService(financialRepository));
  app.patch("/api/pagamentos/:sourceType/:sourceId/observacao", controller.updateObservacao);
  app.post("/api/pagamentos/:sourceType/:sourceId/comprovante", controller.uploadComprovante);
  app.get("/api/pagamentos/:sourceType/:sourceId/comprovante", controller.getComprovante);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const saveObsResponse = await fetch(`${baseUrl}/api/pagamentos/divida/${dividaOwner.id}/observacao`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": owner.id,
      },
      body: JSON.stringify({ observacaoPagamento: "Pago com comprovante anexado" }),
    });
    assert.equal(saveObsResponse.status, 200);

    const [afterObs] = await db.select().from(dividas).where(and(
      eq(dividas.userId, owner.id),
      eq(dividas.id, dividaOwner.id),
    ));
    assert.equal(afterObs?.observacaoPagamento, "Pago com comprovante anexado");

    const fakePdf = Buffer.from("%PDF-1.4 comprovante timeline").toString("base64");
    const uploadResponse = await fetch(`${baseUrl}/api/pagamentos/divida/${dividaOwner.id}/comprovante`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": owner.id,
      },
      body: JSON.stringify({
        fileName: "comprovante.pdf",
        mimeType: "application/pdf",
        contentBase64: fakePdf,
      }),
    });
    assert.equal(uploadResponse.status, 200);

    const [afterUpload] = await db.select().from(dividas).where(and(
      eq(dividas.userId, owner.id),
      eq(dividas.id, dividaOwner.id),
    ));
    assert.ok(afterUpload?.comprovantePath);
    assert.equal(afterUpload?.comprovanteNome, "comprovante.pdf");
    assert.equal(afterUpload?.comprovanteMimeType, "application/pdf");
    assert.equal(afterUpload?.comprovanteTamanho, Buffer.from(fakePdf, "base64").byteLength);

    const downloadResponse = await fetch(`${baseUrl}/api/pagamentos/divida/${dividaOwner.id}/comprovante`, {
      headers: { "x-user-id": owner.id },
    });
    assert.equal(downloadResponse.status, 200);
    assert.equal(downloadResponse.headers.get("content-type"), "application/pdf");
    const bytes = await downloadResponse.arrayBuffer();
    assert.ok(bytes.byteLength > 0);

    const forbiddenUpload = await fetch(`${baseUrl}/api/pagamentos/divida/${dividaOwner.id}/comprovante`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": other.id,
      },
      body: JSON.stringify({
        fileName: "tentativa.pdf",
        mimeType: "application/pdf",
        contentBase64: fakePdf,
      }),
    });
    assert.equal(forbiddenUpload.status, 404);

    const forbiddenDownload = await fetch(`${baseUrl}/api/pagamentos/divida/${dividaOwner.id}/comprovante`, {
      headers: { "x-user-id": other.id },
    });
    assert.equal(forbiddenDownload.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await db.delete(users).where(eq(users.id, owner.id));
    await db.delete(users).where(eq(users.id, other.id));
  }
});
