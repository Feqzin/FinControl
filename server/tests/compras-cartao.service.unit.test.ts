import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CompraCartao, ParcelaCompra } from "@shared/schema";
import { ComprasCartaoService } from "../services/compras-cartao.service";

test("create registra compra parcelada quando cartao existe", async () => {
  const compra: CompraCartao = {
    id: "compra-1",
    userId: "user-compras-unit",
    cartaoId: "cartao-1",
    descricao: "Compra parcelada teste",
    valorTotal: "100.00",
    parcelas: 2,
    parcelaAtual: 1,
    valorParcela: "50.00",
    dataCompra: "2026-04-20",
    pessoaId: null,
    statusPessoa: null,
    dataPagamentoPessoa: null,
    iconeId: null,
  };
  const createdParcelas: ParcelaCompra[] = [];

  const repository = {
    getCartao: async () => ({ id: "cartao-1" }),
    createCompraCartao: async () => compra,
    getCompraCartao: async () => compra,
    getParcelasCompra: async () => [] as ParcelaCompra[],
    createParcelasCompraBulk: async (rows: Array<Omit<ParcelaCompra, "id">>) => {
      const built = rows.map((row, index) => ({ ...row, id: `pc-${index + 1}` })) as ParcelaCompra[];
      createdParcelas.push(...built);
      return built;
    },
    updateCompraCartao: async (_id: string, _userId: string, data: Partial<CompraCartao>) => {
      Object.assign(compra, data);
      return compra;
    },
  };

  const service = new ComprasCartaoService(repository as any);
  const result = await service.create("user-compras-unit", {
    cartaoId: "cartao-1",
    descricao: "Compra parcelada teste",
    valorTotal: "100.00",
    parcelas: 2,
    parcelaAtual: 1,
    valorParcela: "50.00",
    dataCompra: "2026-04-20",
    pessoaId: null,
  });

  if ("error" in result) {
    assert.fail("Nao deveria falhar quando cartao existe");
  }

  assert.equal(result.created.cartaoId, "cartao-1");
  assert.equal(result.created.valorTotal, "100.00");
  assert.equal(result.created.parcelas, 2);
  assert.equal(result.created.parcelaAtual, 1);
  assert.equal(result.created.valorParcela, "50.00");
  assert.equal(createdParcelas.length, 2);
  assert.deepEqual(createdParcelas.map((row) => row.numero), [1, 2]);
  assert.deepEqual(createdParcelas.map((row) => row.valor), ["50.00", "50.00"]);
});

test("update recompõe compra pai quando parcelas_compra existem", async () => {
  const compra: CompraCartao = {
    id: "compra-1",
    userId: "user-compras-unit",
    cartaoId: "cartao-1",
    descricao: "Compra original",
    valorTotal: "100.00",
    parcelas: 2,
    parcelaAtual: 1,
    valorParcela: "50.00",
    dataCompra: "2026-04-20",
    pessoaId: "pessoa-1",
    statusPessoa: "pendente",
    dataPagamentoPessoa: null,
    iconeId: null,
  };

  const parcelasCompra: ParcelaCompra[] = [
    {
      id: "pc-1",
      userId: "user-compras-unit",
      compraCartaoId: "compra-1",
      numero: 1,
      valor: "50.00",
      dataVencimento: "2026-04-20",
      statusCartao: "pago",
      dataPagamentoCartao: "2026-04-20",
      statusPessoa: "pago",
      dataPagamentoPessoa: "2026-04-20",
    },
    {
      id: "pc-2",
      userId: "user-compras-unit",
      compraCartaoId: "compra-1",
      numero: 2,
      valor: "50.00",
      dataVencimento: "2026-05-20",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: "pendente",
      dataPagamentoPessoa: null,
    },
  ];

  const repository = {
    getCartao: async () => ({ id: "cartao-1" }),
    getPessoa: async () => ({ id: "pessoa-1" }),
    updateCompraCartao: async (_id: string, _userId: string, data: Partial<CompraCartao>) => {
      Object.assign(compra, data);
      return compra;
    },
    updateParcelaCompra: async () => undefined,
    getCompraCartao: async () => compra,
    getParcelasCompra: async () => parcelasCompra,
  };

  const service = new ComprasCartaoService(repository as any);
  const result = await service.update("compra-1", "user-compras-unit", {
    descricao: "Compra alterada",
    valorTotal: "999.99",
  });

  if ("error" in result) {
    assert.fail("Nao deveria falhar no update");
  }

  assert.equal(result.updated.descricao, "Compra alterada");
  assert.equal(result.updated.valorTotal, "100.00");
  assert.equal(result.updated.parcelas, 2);
  assert.equal(result.updated.parcelaAtual, 2);
  assert.equal(result.updated.statusPessoa, "pendente");
});

test("update materializa parcelas_compra ausentes em compra legado antes da recomputacao", async () => {
  const compra: CompraCartao = {
    id: "compra-legacy",
    userId: "user-compras-unit",
    cartaoId: "cartao-1",
    descricao: "Compra legado",
    valorTotal: "120.00",
    parcelas: 3,
    parcelaAtual: 2,
    valorParcela: "40.00",
    dataCompra: "2026-04-20",
    pessoaId: null,
    statusPessoa: null,
    dataPagamentoPessoa: null,
    iconeId: null,
  };

  const parcelasCompra: ParcelaCompra[] = [];

  const repository = {
    getCartao: async () => ({ id: "cartao-1" }),
    updateCompraCartao: async (_id: string, _userId: string, data: Partial<CompraCartao>) => {
      Object.assign(compra, data);
      return compra;
    },
    updateParcelaCompra: async () => undefined,
    getCompraCartao: async () => compra,
    getParcelasCompra: async () => parcelasCompra,
    createParcelasCompraBulk: async (rows: Array<Omit<ParcelaCompra, "id">>) => {
      const created = rows.map((row, index) => ({ id: `pc-legacy-${index + 1}`, ...row })) as ParcelaCompra[];
      parcelasCompra.push(...created);
      return created;
    },
  };

  const service = new ComprasCartaoService(repository as any);
  const result = await service.update("compra-legacy", "user-compras-unit", {
    descricao: "Compra legado atualizada",
  });

  if ("error" in result) {
    assert.fail("Nao deveria falhar no update legado");
  }

  assert.equal(result.updated.descricao, "Compra legado atualizada");
  assert.equal(parcelasCompra.length, 3);
  assert.deepEqual(parcelasCompra.map((row) => row.numero), [1, 2, 3]);
  assert.deepEqual(parcelasCompra.map((row) => row.statusCartao), ["pago", "pendente", "pendente"]);
});

test("create retorna CARTAO_NOT_FOUND quando cartao nao existe", async () => {
  const repository = {
    getCartao: async () => undefined,
  };

  const service = new ComprasCartaoService(repository as any);
  const result = await service.create("user-compras-unit", {
    cartaoId: "cartao-inexistente",
    descricao: "Compra invalida",
    valorTotal: "100.00",
    parcelas: 2,
    parcelaAtual: 1,
    valorParcela: "50.00",
    dataCompra: "2026-04-20",
    pessoaId: null,
  });

  assert.deepEqual(result, { error: "CARTAO_NOT_FOUND" });
});

test("update com override de icone trata erro de persistencia conhecido sem derrubar com 500", async () => {
  const compra: CompraCartao = {
    id: "compra-icon-1",
    userId: "user-compras-unit",
    cartaoId: "cartao-1",
    descricao: "Compra com icone",
    valorTotal: "100.00",
    parcelas: 1,
    parcelaAtual: 1,
    valorParcela: "100.00",
    dataCompra: "2026-04-20",
    pessoaId: null,
    statusPessoa: null,
    dataPagamentoPessoa: null,
    iconeId: null,
  };

  const repository = {
    getCompraCartao: async () => compra,
    updateCompraCartao: async () => {
      const error = new Error("column \"icone_id\" of relation \"compras_cartao\" does not exist");
      (error as Error & { code?: string }).code = "42703";
      throw error;
    },
    getParcelasCompra: async () => [] as ParcelaCompra[],
    getCartao: async () => ({ id: "cartao-1" }),
  };

  const service = new ComprasCartaoService(repository as any);
  const result = await service.update("compra-icon-1", "user-compras-unit", {
    descricao: "Compra com icone atualizado",
    iconeId: "netflix",
  });

  assert.deepEqual(result, {
    error: "ICONE_UPDATE_ERROR",
    reason: "ICON_COLUMN_MISSING",
    message: "Não foi possível salvar o ícone manual porque a coluna compras_cartao.icone_id não está disponível.",
  });
});

test("update com override de icone reconhece erro de coluna mesmo sem nome explicito da tabela", async () => {
  const compra: CompraCartao = {
    id: "compra-icon-2",
    userId: "user-compras-unit",
    cartaoId: "cartao-1",
    descricao: "Compra com icone",
    valorTotal: "100.00",
    parcelas: 1,
    parcelaAtual: 1,
    valorParcela: "100.00",
    dataCompra: "2026-04-20",
    pessoaId: null,
    statusPessoa: null,
    dataPagamentoPessoa: null,
    iconeId: null,
  };

  const repository = {
    getCompraCartao: async () => compra,
    updateCompraCartao: async () => {
      const error = new Error("column \"icone_id\" does not exist");
      (error as Error & { code?: string }).code = "42703";
      throw error;
    },
    getParcelasCompra: async () => [] as ParcelaCompra[],
    getCartao: async () => ({ id: "cartao-1" }),
  };

  const service = new ComprasCartaoService(repository as any);
  const result = await service.update("compra-icon-2", "user-compras-unit", {
    descricao: "Compra com icone atualizado",
    iconeId: "mercadolivre",
  });

  assert.deepEqual(result, {
    error: "ICONE_UPDATE_ERROR",
    reason: "ICON_COLUMN_MISSING",
    message: "Não foi possível salvar o ícone manual porque a coluna compras_cartao.icone_id não está disponível.",
  });
});

test("update com override de ícone rejeita referência remota/base64 antes de persistir", async () => {
  const compra: CompraCartao = {
    id: "compra-icon-3",
    userId: "user-compras-unit",
    cartaoId: "cartao-1",
    descricao: "Compra com icone",
    valorTotal: "100.00",
    parcelas: 1,
    parcelaAtual: 1,
    valorParcela: "100.00",
    dataCompra: "2026-04-20",
    pessoaId: null,
    statusPessoa: null,
    dataPagamentoPessoa: null,
    iconeId: null,
  };

  let updateCalled = false;
  const repository = {
    getCompraCartao: async () => compra,
    updateCompraCartao: async () => {
      updateCalled = true;
      return compra;
    },
    getParcelasCompra: async () => [] as ParcelaCompra[],
  };

  const service = new ComprasCartaoService(repository as any);
  const result = await service.update("compra-icon-3", "user-compras-unit", {
    descricao: "Compra com icone atualizado",
    iconeId: "data:image/png;base64,abc123",
  });

  assert.deepEqual(result, { error: "ICONE_INVALID_REFERENCE" });
  assert.equal(updateCalled, false);
});

test("migration guard de icone em compras_cartao continua idempotente e com índice", async () => {
  const migrationPath = path.resolve(process.cwd(), "migrations", "0041_compras_cartao_icone_id_guard.sql");
  const source = await readFile(migrationPath, "utf8");
  assert.match(source, /ADD COLUMN IF NOT EXISTS icone_id text;/i);
  assert.match(source, /CREATE INDEX IF NOT EXISTS idx_compras_cartao_icone_id/i);
});
