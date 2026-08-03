import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import express from "express";
import { requireAuth } from "../../auth";
import { createPessoasController } from "../../controllers/pessoas.controller.js";
import { PessoasService } from "../../services/pessoas.service.js";

function createFixture() {
  const pessoas = [
    { id: "pessoa-a", userId: "user_a", nome: "Emize", deletedAt: null },
    { id: "pessoa-b", userId: "user_a", nome: "Pessoa com abatimento", deletedAt: null },
  ];
  const movimentacoes = [
    {
      id: "manual-a",
      userId: "user_a",
      pessoaId: "pessoa-a",
      tipo: "debito",
      valor: "1300.00",
      data: "2026-07-31",
      origem: "manual",
      categoria: null,
      observacao: "PIX realizado",
      comprovanteReferencia: null,
      dividaId: null,
      compraCartaoId: null,
      parcelaCompraId: null,
      servicoPessoaId: null,
      createdAt: new Date("2026-07-31T12:00:00.000Z"),
    },
    {
      id: "credito-a",
      userId: "user_a",
      pessoaId: "pessoa-a",
      tipo: "credito",
      valor: "1000.00",
      data: "2026-06-19",
      origem: "manual",
      categoria: null,
      observacao: null,
      comprovanteReferencia: null,
      dividaId: null,
      compraCartaoId: null,
      parcelaCompraId: null,
      servicoPessoaId: null,
      createdAt: new Date("2026-06-19T12:00:00.000Z"),
    },
    {
      id: "manual-b",
      userId: "user_a",
      pessoaId: "pessoa-a",
      tipo: "debito",
      valor: "1000.00",
      data: "2026-06-20",
      origem: "manual",
      categoria: null,
      observacao: null,
      comprovanteReferencia: null,
      dividaId: null,
      compraCartaoId: null,
      parcelaCompraId: null,
      servicoPessoaId: null,
      createdAt: new Date("2026-06-20T12:00:00.000Z"),
    },
    {
      id: "automatico-a",
      userId: "user_a",
      pessoaId: "pessoa-b",
      tipo: "debito",
      valor: "100.00",
      data: "2026-07-30",
      origem: "abatimento_divida",
      categoria: null,
      observacao: null,
      comprovanteReferencia: null,
      dividaId: "divida-a",
      compraCartaoId: null,
      parcelaCompraId: null,
      servicoPessoaId: null,
      createdAt: new Date("2026-07-30T12:00:00.000Z"),
    },
  ];

  const storage = {
    async getPessoa(id: string, userId: string) {
      return pessoas.find((pessoa) => pessoa.id === id && pessoa.userId === userId);
    },
    async getPessoaSaldoMovimentacao(id: string, userId: string) {
      return movimentacoes.find((movimentacao) => movimentacao.id === id && movimentacao.userId === userId);
    },
    async getPessoaSaldoMovimentacoesByPessoa(pessoaId: string, userId: string) {
      return movimentacoes.filter(
        (movimentacao) => movimentacao.pessoaId === pessoaId && movimentacao.userId === userId,
      );
    },
    async deletePessoaSaldoMovimentacao(id: string, userId: string) {
      const index = movimentacoes.findIndex((movimentacao) => movimentacao.id === id && movimentacao.userId === userId);
      if (index < 0) return false;
      movimentacoes.splice(index, 1);
      return true;
    },
  };

  return { storage, movimentacoes };
}

async function withTestServer(app: ReturnType<typeof express>, run: (baseUrl: string) => Promise<void>) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function createApp() {
  const fixture = createFixture();
  const controller = createPessoasController(new PessoasService(fixture.storage as any));
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    const userId = req.get("x-test-auth");
    req.isAuthenticated = () => userId === "user_a" || userId === "user_b";
    req.user = userId ? { id: userId } : undefined;
    next();
  });
  app.delete(
    "/api/pessoas/:pessoaId/saldo-movimentacoes/:movimentacaoId",
    requireAuth,
    controller.deleteSaldoMovimentacao,
  );
  app.get(
    "/api/pessoas/:pessoaId/saldo-movimentacoes",
    requireAuth,
    controller.listSaldoMovimentacoes,
  );
  return { app, fixture };
}

test("rota de exclusão de movimentação de saldo exige autenticação", async () => {
  const routesSource = await readFile(
    path.resolve(process.cwd(), "serverless", "routes", "core-domain.routes.ts"),
    "utf8",
  );
  assert.match(
    routesSource,
    /app\.delete\(\s*"\/api\/pessoas\/:pessoaId\/saldo-movimentacoes\/:movimentacaoId"\s*,\s*requireAuth\s*,\s*pessoasController\.deleteSaldoMovimentacao\s*\)/m,
  );

  const { app } = createApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/pessoas/pessoa-a/saldo-movimentacoes/manual-a`, {
      method: "DELETE",
    });
    assert.equal(response.status, 401);
  });
});

test("exclusão remove movimentação manual do próprio usuário", async () => {
  const { app, fixture } = createApp();
  await withTestServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/pessoas/pessoa-a/saldo-movimentacoes/manual-a`, {
      method: "DELETE",
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(response.status, 204);
    assert.equal(fixture.movimentacoes.some((movimentacao) => movimentacao.id === "manual-a"), false);

    const saldoResponse = await fetch(`${baseUrl}/api/pessoas/pessoa-a/saldo-movimentacoes`, {
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(saldoResponse.status, 200);
    const saldo = await saldoResponse.json();
    assert.equal(saldo.resumo.creditos, 1000);
    assert.equal(saldo.resumo.debitos, 1000);
    assert.equal(saldo.resumo.saldoAtual, 0);
    assert.equal(saldo.resumo.movimentacoes, 2);
  });
});

test("exclusão protege ownership e movimentações automáticas vinculadas", async () => {
  const { app, fixture } = createApp();
  await withTestServer(app, async (baseUrl) => {
    const foreignResponse = await fetch(`${baseUrl}/api/pessoas/pessoa-a/saldo-movimentacoes/manual-a`, {
      method: "DELETE",
      headers: { "x-test-auth": "user_b" },
    });
    assert.equal(foreignResponse.status, 404);

    const linkedResponse = await fetch(`${baseUrl}/api/pessoas/pessoa-b/saldo-movimentacoes/automatico-a`, {
      method: "DELETE",
      headers: { "x-test-auth": "user_a" },
    });
    assert.equal(linkedResponse.status, 409);
    assert.equal(fixture.movimentacoes.some((movimentacao) => movimentacao.id === "automatico-a"), true);
  });
});
