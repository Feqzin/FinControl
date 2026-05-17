import test from "node:test";
import assert from "node:assert/strict";
import {
  compraBody,
  compraUpdateBody,
  dividaUpdateBody,
  parcelasCompraBulkBody,
  parcelaUpdateBody,
} from "../validators/financial.validators";

test("dividaUpdateBody normaliza status valido para minusculo", () => {
  const parsed = dividaUpdateBody.safeParse({ status: " PAGO " });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.status, "pago");
});

test("dividaUpdateBody rejeita status invalido", () => {
  const parsed = dividaUpdateBody.safeParse({ status: "qualquer_coisa" });
  assert.equal(parsed.success, false);
});

test("compraUpdateBody aceita statusPessoa vazio e converte para null", () => {
  const parsed = compraUpdateBody.safeParse({ statusPessoa: "   " });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.statusPessoa, null);
});

test("compraBody valida modo de reembolso total com pessoa vinculada", () => {
  const parsed = compraBody.safeParse({
    cartaoId: "cartao-1",
    descricao: "Compra teste",
    valorTotal: "300.00",
    parcelas: 3,
    parcelaAtual: 1,
    valorParcela: "100.00",
    dataCompra: "2026-05-10",
    pessoaId: "pessoa-1",
    reembolsoModo: "total",
  });
  assert.equal(parsed.success, true);
});

test("compraBody bloqueia valor personalizado acima do total da compra", () => {
  const parsed = compraBody.safeParse({
    cartaoId: "cartao-1",
    descricao: "Compra teste",
    valorTotal: "300.00",
    parcelas: 3,
    parcelaAtual: 1,
    valorParcela: "100.00",
    dataCompra: "2026-05-10",
    pessoaId: "pessoa-1",
    reembolsoModo: "valor_custom",
    reembolsoValorTotal: "301.00",
  });
  assert.equal(parsed.success, false);
});

test("compraBody bloqueia percentual customizado maior que 100", () => {
  const parsed = compraBody.safeParse({
    cartaoId: "cartao-1",
    descricao: "Compra teste",
    valorTotal: "300.00",
    parcelas: 3,
    parcelaAtual: 1,
    valorParcela: "100.00",
    dataCompra: "2026-05-10",
    pessoaId: "pessoa-1",
    reembolsoModo: "percentual_custom",
    reembolsoPercentual: 150,
  });
  assert.equal(parsed.success, false);
});

test("parcelaUpdateBody valida enum de status canonico", () => {
  const parsedOk = parcelaUpdateBody.safeParse({ status: "VENCIDO" });
  assert.equal(parsedOk.success, true);
  if (parsedOk.success) {
    assert.equal(parsedOk.data.status, "vencido");
  }

  const parsedInvalid = parcelaUpdateBody.safeParse({ status: "atrasado_demais" });
  assert.equal(parsedInvalid.success, false);
});

test("parcelasCompraBulkBody valida e normaliza statusCartao", () => {
  const parsed = parcelasCompraBulkBody.safeParse({
    compraCartaoId: "compra-1",
    parcelas: [
      {
        numero: 1,
        valor: "10.00",
        statusCartao: "PAGO",
      },
    ],
  });

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.parcelas[0]?.statusCartao, "pago");
});
