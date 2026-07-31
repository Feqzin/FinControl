import test from "node:test";
import assert from "node:assert/strict";
import { FinancialService } from "../services/financial.service";
import { FinancialService as ServerlessFinancialService } from "../../serverless/services/financial.service";

const userId = "user-receivables-summary";

function createRepository() {
  return {
    getDividas: async () => [
      {
        id: "receivable-expected",
        userId,
        pessoaId: "person-1",
        tipo: "receber",
        valor: "500.00",
        dataVencimento: "2026-07-10",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
        descricao: "Recebimento esperado",
        expectativaRecebimento: true,
        totalParcelas: null,
        valorTotal: null,
        deletedAt: null,
      },
      {
        id: "receivable-unexpected",
        userId,
        pessoaId: "person-2",
        tipo: "receber",
        valor: "1000.00",
        dataVencimento: "2026-07-12",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
        descricao: "Sem expectativa",
        expectativaRecebimento: false,
        totalParcelas: null,
        valorTotal: null,
        deletedAt: null,
      },
      {
        id: "receivable-paid",
        userId,
        pessoaId: "person-3",
        tipo: "receber",
        valor: "120.00",
        dataVencimento: "2026-06-15",
        status: "pago",
        dataPagamento: "2026-07-05",
        formaPagamento: "pix",
        descricao: "Recebido em julho",
        expectativaRecebimento: false,
        totalParcelas: null,
        valorTotal: null,
        deletedAt: null,
      },
      {
        id: "payable",
        userId,
        pessoaId: "person-4",
        tipo: "pagar",
        valor: "300.00",
        dataVencimento: "2026-07-20",
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
        descricao: "Conta de julho",
        expectativaRecebimento: true,
        totalParcelas: null,
        valorTotal: null,
        deletedAt: null,
      },
    ],
    getParcelas: async () => [],
    getParcelasCompraByUser: async () => [],
    getCartaoFaturaPagamentos: async () => [],
    getCartaoFaturaPagamentoAlocacoesByPagamentoIds: async () => [],
    getServicos: async () => [],
    getServicoCobrancaPagamentos: async () => [],
    getCartoes: async () => [],
    getComprasCartao: async () => [],
    getRendas: async () => [
      {
        id: "income",
        userId,
        tipo: "fixo",
        descricao: "Salário",
        valor: "1000.00",
        diaRecebimento: 5,
        ativo: true,
      },
    ],
  };
}

test("resumo usa apenas recebimentos realizados para compor o saldo mensal", async () => {
  const services = [
    new FinancialService(createRepository() as any),
    new ServerlessFinancialService(createRepository() as any),
  ];

  for (const service of services) {
    const summary = await service.getSummary(userId, "2026-07");

    assert.equal(summary.totalRenda, 1000);
    assert.equal(summary.totalReceberMes, 500);
    assert.equal(summary.totalRecebidoMes, 120);
    assert.equal(summary.totalPagarMes, 300);
    assert.equal(summary.totalEntradas, 1120);
    assert.equal(summary.totalSaidas, 300);
    assert.equal(summary.saldo, 820);
  }
});
