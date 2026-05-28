import test from "node:test";
import assert from "node:assert/strict";
import type { CompraCartao, Divida, Pessoa, ServicoPessoa } from "../../../shared/schema.js";
import { PessoasService } from "../../services/pessoas.service.js";

function createStorageMock() {
  let seq = 0;
  const pessoas: Pessoa[] = [
    {
      id: "pessoa-user-a",
      userId: "user-a",
      nome: "Pessoa A",
      tipo: "me_deve",
      telefone: null,
      observacao: null,
      deletedAt: null,
    },
  ];

  const dividas: Divida[] = [
    {
      id: "divida-orfa-a1",
      userId: "user-a",
      pessoaId: "pessoa-removida-legado-a",
      tipo: "pagar",
      valor: "94.38",
      dataVencimento: null,
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
      observacaoPagamento: null,
      comprovantePath: null,
      comprovanteNome: null,
      comprovanteMimeType: null,
      comprovanteTamanho: null,
      comprovanteEnviadoEm: null,
      descricao: "Dívida antiga órfã",
      totalParcelas: null,
      valorTotal: null,
    },
    {
      id: "divida-user-b",
      userId: "user-b",
      pessoaId: "pessoa-removida-legado-b",
      tipo: "receber",
      valor: "20.00",
      dataVencimento: null,
      status: "pendente",
      dataPagamento: null,
      formaPagamento: null,
      observacaoPagamento: null,
      comprovantePath: null,
      comprovanteNome: null,
      comprovanteMimeType: null,
      comprovanteTamanho: null,
      comprovanteEnviadoEm: null,
      descricao: "Não deve aparecer para user-a",
      totalParcelas: null,
      valorTotal: null,
    },
  ];

  const compras: CompraCartao[] = [
    {
      id: "compra-orfa-a1",
      userId: "user-a",
      cartaoId: "cartao-a",
      descricao: "Compra órfã",
      valorTotal: "80.00",
      parcelas: 1,
      parcelaAtual: 1,
      valorParcela: "80.00",
      dataCompra: "2026-05-01",
      pessoaId: "pessoa-removida-legado-a",
      statusPessoa: "pendente",
      dataPagamentoPessoa: null,
      reembolsoModo: null,
      reembolsoValorTotal: null,
      reembolsoPercentual: null,
      iconeId: null,
    },
  ];

  const servicoPessoas: ServicoPessoa[] = [
    {
      id: "servico-pessoa-orfa-a1",
      userId: "user-a",
      servicoId: "servico-a",
      pessoaId: "pessoa-removida-legado-a",
      valorDevido: "40.00",
    },
  ];

  const storage = {
    async getPessoasByStatus(userId: string, status: "active" | "removed" | "all") {
      const all = pessoas.filter((pessoa) => pessoa.userId === userId);
      if (status === "all") return all;
      if (status === "removed") return all.filter((pessoa) => Boolean(pessoa.deletedAt));
      return all.filter((pessoa) => !pessoa.deletedAt);
    },
    async getDividas(userId: string) {
      return dividas.filter((divida) => divida.userId === userId);
    },
    async getComprasCartao(userId: string) {
      return compras.filter((compra) => compra.userId === userId);
    },
    async getServicoPessoas(userId: string) {
      return servicoPessoas.filter((item) => item.userId === userId);
    },
    async getPessoa(id: string, userId: string) {
      return pessoas.find((pessoa) => pessoa.id === id && pessoa.userId === userId);
    },
    async createPessoa(input: Omit<Pessoa, "id" | "deletedAt"> & { deletedAt?: Date | null }) {
      const created: Pessoa = {
        id: `pessoa-nova-${++seq}`,
        userId: input.userId,
        nome: input.nome,
        tipo: input.tipo,
        telefone: input.telefone ?? null,
        observacao: input.observacao ?? null,
        deletedAt: input.deletedAt ?? null,
      };
      pessoas.push(created);
      return created;
    },
    async updateDivida(id: string, userId: string, data: Partial<Divida>) {
      const row = dividas.find((divida) => divida.id === id && divida.userId === userId);
      if (!row) return undefined;
      Object.assign(row, data);
      return row;
    },
    async updateCompraCartao(id: string, userId: string, data: Partial<CompraCartao>) {
      const row = compras.find((compra) => compra.id === id && compra.userId === userId);
      if (!row) return undefined;
      Object.assign(row, data);
      return row;
    },
    async updateServicoPessoa(id: string, userId: string, data: Partial<ServicoPessoa>) {
      const row = servicoPessoas.find((item) => item.id === id && item.userId === userId);
      if (!row) return undefined;
      Object.assign(row, data);
      return row;
    },
  };

  return { storage, pessoas, dividas, compras, servicoPessoas };
}

test("pessoas orphan recovery: detecta grupo órfão e mantém isolamento por usuário", async () => {
  const { storage } = createStorageMock();
  const service = new PessoasService(storage as any);

  const orfasUserA = await service.listOrphanLinks("user-a");
  assert.equal(orfasUserA.length, 1);
  assert.equal(orfasUserA[0]?.dividasCount, 1);
  assert.equal(orfasUserA[0]?.linkedComprasCount, 1);
  assert.equal(orfasUserA[0]?.linkedServicosCount, 1);

  const orfasUserB = await service.listOrphanLinks("user-b");
  assert.equal(orfasUserB.length, 1);
  assert.equal(orfasUserB[0]?.dividasCount, 1);
  assert.equal(orfasUserB[0]?.linkedComprasCount, 0);
  assert.equal(orfasUserB[0]?.linkedServicosCount, 0);
});

test("pessoas orphan recovery: cria pessoa e relinka dívidas/compras/serviços sem duplicar", async () => {
  const { storage, dividas, compras, servicoPessoas } = createStorageMock();
  const service = new PessoasService(storage as any);

  const [group] = await service.listOrphanLinks("user-a");
  assert.ok(group);

  const recovered = await service.recoverOrphanLinks("user-a", {
    orphanGroupKey: group.orphanGroupKey,
    nome: "Rosana",
  });
  assert.ok(!("error" in recovered));
  if ("error" in recovered) return;

  assert.equal(recovered.createdPessoa, true);
  assert.equal(recovered.linkedDividasCount, 1);
  assert.equal(recovered.linkedComprasCount, 1);
  assert.equal(recovered.linkedServicosCount, 1);

  assert.equal(dividas[0]?.pessoaId, recovered.pessoaId);
  assert.equal(compras[0]?.pessoaId, recovered.pessoaId);
  assert.equal(servicoPessoas[0]?.pessoaId, recovered.pessoaId);

  const rerun = await service.recoverOrphanLinks("user-a", {
    orphanGroupKey: group.orphanGroupKey,
    pessoaIdExistente: recovered.pessoaId,
  });
  assert.ok(!("error" in rerun));
  if ("error" in rerun) return;

  assert.equal(rerun.linkedDividasCount, 0);
  assert.equal(rerun.linkedComprasCount, 0);
  assert.equal(rerun.linkedServicosCount, 0);
});
