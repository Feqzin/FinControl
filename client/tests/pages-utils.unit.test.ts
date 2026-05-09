import test from "node:test";
import assert from "node:assert/strict";
import { formatCurrencyBRL, formatIsoDateToBR } from "../src/utils/formatters";
import { isOverdueDate } from "../src/pages/dividas/dividas.utils";
import { getDaysUntilInvoice, getNextInvoiceDate, isParcelaVencida } from "../src/pages/cartoes/cartoes.utils";
import { parseCsv } from "../src/pages/cartoes/import-parser";
import {
  buildTimelineLayout,
  findSelectedTimelineEvent,
  formatBytes,
  getTimelineCanvasWidth,
  getTimelineStatusVisual,
  getTimelineEventKey,
  toTimelineDateLabel,
} from "../src/pages/pessoas/payment-timeline.utils";

test("formatters: moeda e data em pt-BR", () => {
  assert.equal(formatCurrencyBRL(1234.56), "R$\u00a01.234,56");
  assert.equal(formatIsoDateToBR("2026-04-20"), "20/04/2026");
  assert.equal(formatIsoDateToBR(undefined), "—");
});

test("dividas utils: identifica vencimento passado", () => {
  assert.equal(isOverdueDate("2000-01-01"), true);
  assert.equal(isOverdueDate("2999-01-01"), false);
  assert.equal(isOverdueDate(undefined), false);
});

test("cartoes utils: calcula próxima fatura e dias restantes", () => {
  const next = getNextInvoiceDate(20);
  assert.match(next, /^\d{2}\/\d{2}\/\d{4}$/);

  const days = getDaysUntilInvoice(20);
  assert.equal(Number.isInteger(days), true);
  assert.equal(days >= 0, true);
  assert.equal(days <= 62, true);
});

test("cartoes utils: parcela vencida somente quando pendente e data passada", () => {
  assert.equal(
    isParcelaVencida({
      id: "1",
      userId: "u1",
      compraCartaoId: "c1",
      numero: 1,
      valor: "10.00",
      dataVencimento: "2000-01-01",
      statusCartao: "pendente",
      dataPagamentoCartao: null,
      statusPessoa: null,
      dataPagamentoPessoa: null,
    }),
    true,
  );

  assert.equal(
    isParcelaVencida({
      id: "2",
      userId: "u1",
      compraCartaoId: "c1",
      numero: 1,
      valor: "10.00",
      dataVencimento: "2000-01-01",
      statusCartao: "pago",
      dataPagamentoCartao: "2000-01-01",
      statusPessoa: null,
      dataPagamentoPessoa: null,
    }),
    false,
  );
});

test("timeline utils: status define cores e labels corretos", () => {
  const pago = getTimelineStatusVisual("pago");
  assert.equal(pago.label, "Pago");
  assert.match(pago.dotClassName, /emerald/);
  assert.match(pago.badgeClassName, /emerald/);

  const vencido = getTimelineStatusVisual("vencido");
  assert.equal(vencido.label, "Vencido");
  assert.match(vencido.dotClassName, /red/);
  assert.match(vencido.badgeClassName, /red/);

  const pendente = getTimelineStatusVisual("pendente");
  assert.equal(pendente.label, "Pendente");
  assert.match(pendente.dotClassName, /amber/);
  assert.match(pendente.badgeClassName, /amber/);
});

test("timeline utils: detalhe do evento usa label de data correta", () => {
  assert.equal(
    toTimelineDateLabel({
      id: "evt-1",
      sourceType: "parcela",
      sourceId: "parcela-1",
      dividaId: "divida-1",
      tipoDivida: "receber",
      titulo: "Teste pago",
      kind: "pagamento_realizado",
      status: "pago",
      dataEvento: "2026-04-20",
      dataPagamento: "2026-04-20",
      dataVencimento: "2026-04-19",
      valor: "10.00",
      observacaoPagamento: null,
      comprovante: null,
    }),
    "Pagamento",
  );

  assert.equal(
    toTimelineDateLabel({
      id: "evt-2",
      sourceType: "divida",
      sourceId: "divida-2",
      dividaId: "divida-2",
      tipoDivida: "pagar",
      titulo: "Teste vencido",
      kind: "pagamento_vencido",
      status: "vencido",
      dataEvento: "2026-04-10",
      dataPagamento: null,
      dataVencimento: "2026-04-10",
      valor: "25.00",
      observacaoPagamento: null,
      comprovante: null,
    }),
    "Vencimento",
  );
});

test("timeline utils: formata tamanho de comprovante", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1.0 KB");
});

test("timeline utils: distribui eventos em ordem cronologica no eixo horizontal", () => {
  const timeline = buildTimelineLayout([
    {
      id: "evt-3",
      sourceType: "divida",
      sourceId: "divida-3",
      dividaId: "divida-3",
      tipoDivida: "pagar",
      titulo: "Evento C",
      kind: "pagamento_vencido",
      status: "vencido",
      dataEvento: "2026-06-10",
      dataPagamento: null,
      dataVencimento: "2026-06-10",
      valor: "300.00",
      observacaoPagamento: null,
      comprovante: null,
    },
    {
      id: "evt-1",
      sourceType: "parcela",
      sourceId: "parcela-1",
      dividaId: "divida-1",
      tipoDivida: "receber",
      titulo: "Evento A",
      kind: "pagamento_realizado",
      status: "pago",
      dataEvento: "2026-04-10",
      dataPagamento: "2026-04-10",
      dataVencimento: "2026-04-09",
      valor: "100.00",
      observacaoPagamento: null,
      comprovante: null,
    },
    {
      id: "evt-2",
      sourceType: "parcela",
      sourceId: "parcela-2",
      dividaId: "divida-2",
      tipoDivida: "receber",
      titulo: "Evento B",
      kind: "pagamento_pendente",
      status: "pendente",
      dataEvento: "2026-05-10",
      dataPagamento: null,
      dataVencimento: "2026-05-10",
      valor: "200.00",
      observacaoPagamento: null,
      comprovante: null,
    },
  ]);

  assert.equal(timeline.items.length, 3);
  assert.equal(timeline.items[0]?.event.id, "evt-1");
  assert.equal(timeline.items[1]?.event.id, "evt-2");
  assert.equal(timeline.items[2]?.event.id, "evt-3");
  assert.ok((timeline.items[0]?.x ?? 0) < (timeline.items[1]?.x ?? 0));
  assert.ok((timeline.items[1]?.x ?? 0) < (timeline.items[2]?.x ?? 0));
});

test("timeline utils: largura cresce para suportar muitos eventos com scroll horizontal", () => {
  const widthWithTwo = getTimelineCanvasWidth(2);
  const widthWithTwelve = getTimelineCanvasWidth(12);
  assert.ok(widthWithTwelve > widthWithTwo);
  assert.ok(widthWithTwo >= 720);
});

test("timeline utils: chave selecionada encontra evento correto para abrir detalhe", () => {
  const events = [
    {
      id: "evt-1",
      sourceType: "parcela",
      sourceId: "parcela-1",
      dividaId: "divida-1",
      tipoDivida: "receber",
      titulo: "Evento A",
      kind: "pagamento_realizado",
      status: "pago",
      dataEvento: "2026-04-10",
      dataPagamento: "2026-04-10",
      dataVencimento: "2026-04-09",
      valor: "100.00",
      observacaoPagamento: "obs A",
      comprovante: null,
    },
    {
      id: "evt-2",
      sourceType: "divida",
      sourceId: "divida-2",
      dividaId: "divida-2",
      tipoDivida: "pagar",
      titulo: "Evento B",
      kind: "pagamento_vencido",
      status: "vencido",
      dataEvento: "2026-05-10",
      dataPagamento: null,
      dataVencimento: "2026-05-10",
      valor: "200.00",
      observacaoPagamento: null,
      comprovante: {
        nome: "comp.pdf",
        mimeType: "application/pdf",
        tamanho: 1280,
        downloadUrl: "/api/pagamentos/divida/divida-2/comprovante",
      },
    },
  ] as const;

  const selectedKey = getTimelineEventKey(events[1]);
  const selected = findSelectedTimelineEvent([...events], selectedKey);
  assert.equal(selected?.id, "evt-2");
});

test("import parser: data dd/mm usa ano da fatura quando informado", () => {
  const input = [
    "Vencimento 20/05/2026",
    "06/05 MERCADO CENTRAL 90,00 1/1",
  ].join("\n");

  const result = parseCsv(input, [], "cartao-1", { referenceBillingDate: "2026-05-20" });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.dataCompra, "2026-05-06");
});

test("import parser: valor pt-BR e en-US sao reconhecidos", () => {
  const csvBr = [
    "Data;Descricao;Valor",
    "06/05/2026;Padaria;1.234,56",
  ].join("\n");
  const csvUs = [
    "Date,Title,Amount",
    "2026-05-06,Store,\"1,234.56\"",
  ].join("\n");

  const parsedBr = parseCsv(csvBr, [], "cartao-1");
  const parsedUs = parseCsv(csvUs, [], "cartao-1");

  assert.equal(parsedBr.items[0]?.valorParcela, 1234.56);
  assert.equal(parsedUs.items[0]?.valorParcela, 1234.56);
});

test("import parser: detecta parcelas em formatos comuns", () => {
  const input = [
    "Vencimento 20/05/2026",
    "06/05 Loja Tech parcela 3 de 10 120,00",
    "07/05 Fone bluetooth 10x 80,00",
  ].join("\n");

  const result = parseCsv(input, [], "cartao-1", { referenceBillingDate: "2026-05-20" });
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.parcelaAtual, 3);
  assert.equal(result.items[0]?.parcelas, 10);
  assert.equal(result.items[1]?.parcelas, 10);
  assert.equal(result.items[1]?.parcelaAtual, 1);
  assert.equal(result.items[1]?.reviewRequired, true);
});
