import test from "node:test";
import assert from "node:assert/strict";
import { ServicosService } from "../services/servicos.service";
import { servicoUpdateBody } from "../validators/core-domain.validators";

test("ServicosService.createServicoPessoa falha quando servico nao pertence ao usuario", async () => {
  let createCalled = false;

  const storage = {
    getServico: async () => undefined,
    getPessoa: async () => ({ id: "pessoa-1" }),
    createServicoPessoa: async () => {
      createCalled = true;
      return { id: "sp-1" };
    },
  } as any;

  const service = new ServicosService(storage);
  const result = await service.createServicoPessoa("user-1", {
    servicoId: "serv-404",
    pessoaId: "pessoa-1",
    valorDevido: "10.00",
  });

  assert.deepEqual(result, { error: "SERVICO_NOT_FOUND" });
  assert.equal(createCalled, false);
});

test("ServicosService.createServicoPessoa falha quando pessoa nao pertence ao usuario", async () => {
  let createCalled = false;

  const storage = {
    getServico: async () => ({ id: "serv-1" }),
    getPessoa: async () => undefined,
    createServicoPessoa: async () => {
      createCalled = true;
      return { id: "sp-1" };
    },
  } as any;

  const service = new ServicosService(storage);
  const result = await service.createServicoPessoa("user-1", {
    servicoId: "serv-1",
    pessoaId: "pessoa-404",
    valorDevido: "10.00",
  });

  assert.deepEqual(result, { error: "PESSOA_NOT_FOUND" });
  assert.equal(createCalled, false);
});

test("ServicosService.createServicoPessoa cria vinculo quando ownership esta valido", async () => {
  let payload: Record<string, unknown> | null = null;

  const storage = {
    getServico: async () => ({ id: "serv-1" }),
    getPessoa: async () => ({ id: "pessoa-1" }),
    createServicoPessoa: async (nextPayload: Record<string, unknown>) => {
      payload = nextPayload;
      return { id: "sp-1", ...nextPayload };
    },
  } as any;

  const service = new ServicosService(storage);
  const result = await service.createServicoPessoa("user-1", {
    servicoId: "serv-1",
    pessoaId: "pessoa-1",
    valorDevido: "25.00",
  });

  assert.ok("created" in result);
  assert.deepEqual(payload, {
    userId: "user-1",
    servicoId: "serv-1",
    pessoaId: "pessoa-1",
    valorDevido: "25.00",
  });
});

test("ServicosService.createServicoPagamento falha quando servicoPessoa nao pertence ao usuario", async () => {
  let createCalled = false;

  const storage = {
    getServicoPessoas: async () => [{ id: "sp-1" }],
    createServicoPagamento: async () => {
      createCalled = true;
      return { id: "pg-1" };
    },
  } as any;

  const service = new ServicosService(storage);
  const result = await service.createServicoPagamento("user-1", {
    servicoPessoaId: "sp-404",
    mes: "2026-04",
    status: "pago",
    dataPagamento: "2026-04-20",
  });

  assert.deepEqual(result, { error: "SERVICO_PESSOA_NOT_FOUND" });
  assert.equal(createCalled, false);
});

test("ServicosService.createServicoPagamento cria pagamento quando ownership esta valido", async () => {
  let payload: Record<string, unknown> | null = null;

  const storage = {
    getServicoPessoas: async () => [{ id: "sp-1" }],
    createServicoPagamento: async (nextPayload: Record<string, unknown>) => {
      payload = nextPayload;
      return { id: "pg-1", ...nextPayload };
    },
  } as any;

  const service = new ServicosService(storage);
  const result = await service.createServicoPagamento("user-1", {
    servicoPessoaId: "sp-1",
    mes: "2026-04",
    status: "pago",
    dataPagamento: "2026-04-20",
  });

  assert.ok("created" in result);
  assert.deepEqual(payload, {
    userId: "user-1",
    servicoPessoaId: "sp-1",
    mes: "2026-04",
    status: "pago",
    dataPagamento: "2026-04-20",
  });
});

test("servicoUpdateBody aceita compraCartaoId nulo ou preenchido no update", () => {
  const parsedNull = servicoUpdateBody.safeParse({ compraCartaoId: null });
  assert.equal(parsedNull.success, true);
  if (parsedNull.success) {
    assert.equal(parsedNull.data.compraCartaoId, null);
  }

  const parsedTrimmed = servicoUpdateBody.safeParse({ compraCartaoId: "  compra-123  " });
  assert.equal(parsedTrimmed.success, true);
  if (parsedTrimmed.success) {
    assert.equal(parsedTrimmed.data.compraCartaoId, "compra-123");
  }
});

test("ServicosService.updateServico propaga compraCartaoId quando enviado pela tela de edicao", async () => {
  let payload: Record<string, unknown> | null = null;

  const storage = {
    getServico: async () => ({
      id: "serv-1",
      valorMensal: "59.90",
      valorCobranca: "59.90",
      periodicidadeCobranca: "mensal",
      compraCartaoId: "compra-antiga",
    }),
    updateServico: async (_id: string, _userId: string, nextPayload: Record<string, unknown>) => {
      payload = nextPayload;
      return { id: "serv-1", ...nextPayload };
    },
  } as any;

  const service = new ServicosService(storage);
  await service.updateServico("serv-1", "user-1", {
    nome: "Servico atualizado",
    compraCartaoId: null,
  });

  assert.deepEqual(payload, {
    nome: "Servico atualizado",
    compraCartaoId: null,
  });
});
