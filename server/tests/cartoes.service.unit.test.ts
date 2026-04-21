import test from "node:test";
import assert from "node:assert/strict";
import { CartoesService } from "../services/cartoes.service";

test("CartoesService.create inclui userId e preserva payload de cartao", async () => {
  let createPayload: Record<string, unknown> | null = null;

  const repository = {
    createCartao: async (payload: Record<string, unknown>) => {
      createPayload = payload;
      return {
        id: "cartao-1",
        ...payload,
        iconeId: null,
      };
    },
  } as any;

  const service = new CartoesService(repository);
  const created = await service.create("user-1", {
    nome: "Cartao XPTO",
    limite: "5000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
  });

  assert.deepEqual(createPayload, {
    userId: "user-1",
    nome: "Cartao XPTO",
    limite: "5000.00",
    melhorDiaCompra: 10,
    diaVencimento: 20,
  });
  assert.equal(created.id, "cartao-1");
  assert.equal(created.userId, "user-1");
});

test("CartoesService.update e delete delegam para repository sem alterar retorno", async () => {
  const repository = {
    updateCartao: async () => undefined,
    deleteCartao: async () => false,
  } as any;

  const service = new CartoesService(repository);
  const updated = await service.update("cartao-404", "user-1", { nome: "Novo nome" });
  const deleted = await service.delete("cartao-404", "user-1");

  assert.equal(updated, undefined);
  assert.equal(deleted, false);
});
