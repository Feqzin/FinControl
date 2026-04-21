import test from "node:test";
import assert from "node:assert/strict";
import type { CompraCartao, Divida, InsertCompraCartao, InsertDivida, InsertParcela, Parcela, ParcelaCompra } from "@shared/schema";
import { DividasService } from "../services/dividas.service";
import { ParcelasService } from "../services/parcelas.service";
import { ComprasCartaoService } from "../services/compras-cartao.service";

type InMemoryState = {
  dividas: Divida[];
  parcelas: Parcela[];
  compras: CompraCartao[];
  parcelasCompra: ParcelaCompra[];
};

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function withTransaction<TRepository extends Record<string, unknown>>(
  state: InMemoryState,
  repository: TRepository,
) {
  return {
    ...repository,
    async withTransaction<T>(callback: (repo: any) => Promise<T>): Promise<T> {
      const snapshot = cloneState(state);
      try {
        return await callback(this);
      } catch (error) {
        state.dividas = snapshot.dividas;
        state.parcelas = snapshot.parcelas;
        state.compras = snapshot.compras;
        state.parcelasCompra = snapshot.parcelasCompra;
        throw error;
      }
    },
  };
}

test("transacao: createParcelado faz rollback se houver falha na criacao de parcelas", async () => {
  const state: InMemoryState = {
    dividas: [],
    parcelas: [],
    compras: [],
    parcelasCompra: [],
  };

  const repository = withTransaction(state, {
    getPessoa: async () => ({ id: "pessoa-1" }),
    createDivida: async (data: InsertDivida) => {
      const created = { id: "divida-1", ...data } as Divida;
      state.dividas.push(created);
      return created;
    },
    createParcelasBulk: async (_rows: InsertParcela[]) => {
      throw new Error("FORCED_CREATE_PARCELAS_FAILURE");
    },
    getDivida: async (id: string) => state.dividas.find((item) => item.id === id),
    getParcelasByDivida: async (dividaId: string) => state.parcelas.filter((item) => item.dividaId === dividaId),
    updateDivida: async (id: string, _userId: string, data: Partial<InsertDivida>) => {
      const row = state.dividas.find((item) => item.id === id);
      if (!row) return undefined;
      Object.assign(row, data);
      return row;
    },
  });

  const service = new DividasService(repository as any);
  await assert.rejects(async () => service.createParcelado({
    pessoaId: "pessoa-1",
    tipo: "pagar",
    valorTotal: 300,
    totalParcelas: 3,
    primeiroVencimento: "2026-05-10",
    descricao: "Teste transacao",
    formaPagamento: "pix",
  }, "user-tx"));

  assert.equal(state.dividas.length, 0);
  assert.equal(state.parcelas.length, 0);
});

test("transacao: antecipar parcelas faz rollback quando recomputacao da divida falha", async () => {
  const state: InMemoryState = {
    dividas: [{
      id: "divida-1",
      userId: "user-tx",
      pessoaId: "pessoa-1",
      tipo: "pagar",
      valor: "100.00",
      dataVencimento: "2026-05-10",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
      descricao: "Divida tx",
      totalParcelas: 2,
      valorTotal: "200.00",
    }],
    parcelas: [
      {
        id: "parcela-1",
        userId: "user-tx",
        dividaId: "divida-1",
        numero: 1,
        valor: "100.00",
        dataVencimento: "2026-05-10",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
      {
        id: "parcela-2",
        userId: "user-tx",
        dividaId: "divida-1",
        numero: 2,
        valor: "100.00",
        dataVencimento: "2026-06-10",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
    ],
    compras: [],
    parcelasCompra: [],
  };

  const repository = withTransaction(state, {
    getParcelasByDivida: async (dividaId: string) => state.parcelas.filter((item) => item.dividaId === dividaId),
    updateParcela: async (id: string, _userId: string, data: Partial<InsertParcela>) => {
      const row = state.parcelas.find((item) => item.id === id);
      if (!row) return undefined;
      Object.assign(row, data);
      return row;
    },
    getDivida: async (id: string) => state.dividas.find((item) => item.id === id),
    updateDivida: async () => {
      throw new Error("FORCED_RECOMPUTE_FAILURE");
    },
  });

  const service = new ParcelasService(repository as any);
  await assert.rejects(async () => service.antecipar("user-tx", {
    dividaId: "divida-1",
    quantidade: 2,
    formaPagamento: "pix",
  }));

  assert.ok(state.parcelas.every((item) => item.status === "pendente"));
  assert.equal(state.dividas[0]?.status, "pendente");
});

test("transacao: create compra parcelada faz rollback se materializacao de parcelas falhar", async () => {
  const state: InMemoryState = {
    dividas: [],
    parcelas: [],
    compras: [],
    parcelasCompra: [],
  };

  const repository = withTransaction(state, {
    getCartao: async () => ({ id: "cartao-1" }),
    createCompraCartao: async (data: InsertCompraCartao) => {
      const created = { id: "compra-1", ...data } as CompraCartao;
      state.compras.push(created);
      return created;
    },
    getParcelasCompra: async () => [],
    createParcelasCompraBulk: async (_rows: Array<Omit<ParcelaCompra, "id">>) => {
      throw new Error("FORCED_MATERIALIZATION_FAILURE");
    },
    getCompraCartao: async (id: string) => state.compras.find((item) => item.id === id),
    updateCompraCartao: async (id: string, _userId: string, data: Partial<InsertCompraCartao>) => {
      const row = state.compras.find((item) => item.id === id);
      if (!row) return undefined;
      Object.assign(row, data);
      return row;
    },
  });

  const service = new ComprasCartaoService(repository as any);
  await assert.rejects(async () => service.create("user-tx", {
    cartaoId: "cartao-1",
    descricao: "Compra tx",
    valorTotal: "200.00",
    parcelas: 2,
    parcelaAtual: 1,
    valorParcela: "100.00",
    dataCompra: "2026-05-10",
    pessoaId: null,
  }));

  assert.equal(state.compras.length, 0);
  assert.equal(state.parcelasCompra.length, 0);
});

test("transacao: update de divida parcelada faz rollback quando recomputacao falha", async () => {
  const state: InMemoryState = {
    dividas: [{
      id: "divida-update-1",
      userId: "user-tx",
      pessoaId: "pessoa-1",
      tipo: "pagar",
      valor: "100.00",
      dataVencimento: "2026-05-10",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
      descricao: "Divida update tx",
      totalParcelas: 2,
      valorTotal: "200.00",
    }],
    parcelas: [
      {
        id: "parcela-update-1",
        userId: "user-tx",
        dividaId: "divida-update-1",
        numero: 1,
        valor: "100.00",
        dataVencimento: "2026-05-10",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
      {
        id: "parcela-update-2",
        userId: "user-tx",
        dividaId: "divida-update-1",
        numero: 2,
        valor: "100.00",
        dataVencimento: "2026-06-10",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      },
    ],
    compras: [],
    parcelasCompra: [],
  };

  let updateDividaCalls = 0;
  const repository = withTransaction(state, {
    updateDivida: async (id: string, _userId: string, data: Partial<InsertDivida>) => {
      updateDividaCalls += 1;
      if (updateDividaCalls > 1) {
        throw new Error("FORCED_DIVIDA_RECOMPUTE_FAILURE");
      }
      const row = state.dividas.find((item) => item.id === id);
      if (!row) return undefined;
      Object.assign(row, data);
      return row;
    },
    getDivida: async (id: string) => state.dividas.find((item) => item.id === id),
    getParcelasByDivida: async (dividaId: string) => state.parcelas.filter((item) => item.dividaId === dividaId),
  });

  const service = new DividasService(repository as any);
  await assert.rejects(async () => service.update("divida-update-1", "user-tx", {
    status: "pago",
    dataPagamento: "2026-05-10",
    formaPagamento: "pix",
  }));

  assert.equal(state.dividas[0]?.status, "pendente");
  assert.equal(state.dividas[0]?.dataPagamento, null);
  assert.equal(state.dividas[0]?.formaPagamento, null);
});

test("transacao: pagamento de parcela faz rollback quando recomputacao da divida falha", async () => {
  const state: InMemoryState = {
    dividas: [{
      id: "divida-pay-1",
      userId: "user-tx",
      pessoaId: "pessoa-1",
      tipo: "pagar",
      valor: "100.00",
      dataVencimento: "2026-05-10",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
      descricao: "Divida pay tx",
      totalParcelas: 1,
      valorTotal: "100.00",
    }],
    parcelas: [{
      id: "parcela-pay-1",
      userId: "user-tx",
      dividaId: "divida-pay-1",
      numero: 1,
      valor: "100.00",
      dataVencimento: "2026-05-10",
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
    }],
    compras: [],
    parcelasCompra: [],
  };

  const repository = withTransaction(state, {
    updateParcela: async (id: string, _userId: string, data: Partial<InsertParcela>) => {
      const row = state.parcelas.find((item) => item.id === id);
      if (!row) return undefined;
      Object.assign(row, data);
      return row;
    },
    getDivida: async (id: string) => state.dividas.find((item) => item.id === id),
    getParcelasByDivida: async (dividaId: string) => state.parcelas.filter((item) => item.dividaId === dividaId),
    updateDivida: async () => {
      throw new Error("FORCED_PAYMENT_RECOMPUTE_FAILURE");
    },
  });

  const service = new ParcelasService(repository as any);
  await assert.rejects(async () => service.update("parcela-pay-1", "user-tx", {
    status: "pago",
    dataPagamento: "2026-05-10",
    formaPagamento: "pix",
  }));

  assert.equal(state.parcelas[0]?.status, "pendente");
  assert.equal(state.parcelas[0]?.dataPagamento, null);
  assert.equal(state.parcelas[0]?.formaPagamento, null);
});

test("transacao: update de compra parcelada faz rollback quando recomputacao falha", async () => {
  const state: InMemoryState = {
    dividas: [],
    parcelas: [],
    compras: [{
      id: "compra-update-1",
      userId: "user-tx",
      cartaoId: "cartao-1",
      descricao: "Compra update tx",
      valorTotal: "100.00",
      parcelas: 2,
      parcelaAtual: 1,
      valorParcela: "50.00",
      dataCompra: "2026-05-10",
      pessoaId: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    }],
    parcelasCompra: [
      {
        id: "pc-update-1",
        userId: "user-tx",
        compraCartaoId: "compra-update-1",
        numero: 1,
        valor: "50.00",
        dataVencimento: "2026-05-10",
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
      {
        id: "pc-update-2",
        userId: "user-tx",
        compraCartaoId: "compra-update-1",
        numero: 2,
        valor: "50.00",
        dataVencimento: "2026-06-10",
        statusCartao: "pendente",
        dataPagamentoCartao: null,
        statusPessoa: null,
        dataPagamentoPessoa: null,
      },
    ],
  };

  let updateCompraCalls = 0;
  const repository = withTransaction(state, {
    updateCompraCartao: async (id: string, _userId: string, data: Partial<InsertCompraCartao>) => {
      updateCompraCalls += 1;
      if (updateCompraCalls > 1) {
        throw new Error("FORCED_COMPRA_RECOMPUTE_FAILURE");
      }
      const row = state.compras.find((item) => item.id === id);
      if (!row) return undefined;
      Object.assign(row, data);
      return row;
    },
    getCompraCartao: async (id: string) => state.compras.find((item) => item.id === id),
    getParcelasCompra: async (compraCartaoId: string) => state.parcelasCompra.filter((item) => item.compraCartaoId === compraCartaoId),
  });

  const service = new ComprasCartaoService(repository as any);
  await assert.rejects(async () => service.update("compra-update-1", "user-tx", {
    valorTotal: "999.99",
  }));

  assert.equal(state.compras[0]?.valorTotal, "100.00");
  assert.equal(state.compras[0]?.descricao, "Compra update tx");
});
