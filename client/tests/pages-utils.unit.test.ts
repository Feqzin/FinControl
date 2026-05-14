import test from "node:test";
import assert from "node:assert/strict";
import { formatCurrencyBRL, formatIsoDateToBR } from "../src/utils/formatters";
import { isOverdueDate } from "../src/pages/dividas/dividas.utils";
import { getDaysUntilInvoice, getNextInvoiceDate, isParcelaVencida } from "../src/pages/cartoes/cartoes.utils";
import {
  detectInvoiceIssuerForPdfText,
  detectItauInvoiceText,
  detectRecurringServiceCandidate,
  detectNubankInvoiceText,
  extractNubankInvoiceYear,
  getPlannedInvoiceIssuers,
  getRegisteredInvoiceParsers,
  parseCsv,
  parseItauInvoiceText,
  parseOfx,
  parseNubankInvoiceText,
  parsePdf,
} from "../src/pages/cartoes/import-parser";
import { suggestImportCardByText } from "../src/pages/cartoes/import-card-matching";
import type { Cartao } from "@shared/schema";
import {
  extractTextFromPdfBuffer,
  hasPdfMagicBytes,
  isExtractedPdfTextUsable,
  reconstructPdfLinesByPosition,
} from "../src/pages/cartoes/import-pdf-utils";
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

test("import parser: detecta assinatura textual da fatura Nubank e ano de referencia", () => {
  const pdfText = [
    "Olá, Fernando. Esta é a sua fatura de abril, no valor de R$ 1.756,32",
    "FATURA 24 ABR 2026",
    "RESUMO DA FATURA ATUAL",
    "TRANSAÇÕES DE 17 MAR A 17 ABR",
  ].join("\n");

  assert.equal(detectNubankInvoiceText(pdfText), true);
  assert.equal(detectInvoiceIssuerForPdfText(pdfText), "nubank");
  assert.equal(extractNubankInvoiceYear(pdfText), 2026);
});

test("import parser: detecta assinatura textual da fatura Itau", () => {
  const pdfText = [
    "Cartao Itaucard",
    "Resumo da fatura em R$",
    "Lancamentos: compras e saques",
    "Limite total de credito",
  ].join("\n");

  assert.equal(detectItauInvoiceText(pdfText), true);
  assert.equal(detectInvoiceIssuerForPdfText(pdfText), "itau");
});

test("import parser: detecta Itau mesmo com texto quebrado por acentos/espacos", () => {
  const pdfText = [
    "Itaúcard",
    "Lan ç amentos: compras e saques",
    "Compras parceladas - pr ó ximas faturas",
    "Limite de cr é dito",
    "4004 4828",
    "0800 970 4828",
  ].join("\n");

  assert.equal(detectItauInvoiceText(pdfText), true);
  assert.equal(detectInvoiceIssuerForPdfText(pdfText), "itau");
});

test("import parser: registry lista parser Nubank e prepara emissores futuros", () => {
  const registered = getRegisteredInvoiceParsers();
  assert.equal(registered.length >= 2, true);
  assert.equal(registered.some((parser) => parser.issuer === "itau"), true);
  assert.equal(registered.some((parser) => parser.parserName === "itau_textual_pdf"), true);
  assert.equal(registered.some((parser) => parser.issuer === "nubank"), true);
  assert.equal(registered.some((parser) => parser.parserName === "nubank_textual_pdf"), true);

  const planned = getPlannedInvoiceIssuers();
  assert.equal(planned.includes("nubank"), true);
  assert.equal(planned.includes("itau"), true);
  assert.equal(planned.includes("mercado_pago"), true);
  assert.equal(planned.includes("c6"), true);
  assert.equal(planned.includes("santander"), true);
  assert.equal(planned.includes("bradesco"), true);
  assert.equal(planned.includes("banco_do_brasil"), true);
});

test("import parser: PDF Nubank importa apenas linhas reais da seção de transações", () => {
  const pdfText = [
    "Olá, Fernando. Esta é a sua fatura de abril, no valor de R$ 1.756,32",
    "FATURA 24 ABR 2026",
    "Fatura anterior R$ 1.423,13",
    "Pagamento recebido −R$ 1.623,13",
    "Total a pagar R$ 1.756,32",
    "Limite total R$ 3.291,33 R$ 4.050,00",
    "FERNANDO QUINTELA BANDEIRA",
    "TRANSAÇÕES DE 17 MAR A 17 ABR",
    "17 MAR Mad Vestuario - Parcela 2/2 R$ 163,42",
    "17 MAR Amazonmktplc*Ikaraindu - Parcela 5/10 R$ 53,01",
    "Pagamento em 20 MAR −R$ 1.300,00",
    "01 ABR Mp *Hasag - Parcela 1/2 R$ 229,68",
    "12 ABR Dl*Uberrides R$ 37,94",
    "Em cumprimento à regulação vigente, consulte o Registrato.",
    "O Nubank declara que...",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-1");
  assert.equal(result.items.length, 4);

  const descriptions = result.items.map((item) => item.descricao.toLowerCase());
  assert.equal(descriptions.some((value) => value.includes("ola, fernando")), false);
  assert.equal(descriptions.some((value) => value.includes("total a pagar")), false);
  assert.equal(descriptions.some((value) => value.includes("fatura anterior")), false);
  assert.equal(descriptions.some((value) => value.includes("pagamento em")), false);
  assert.equal(descriptions.some((value) => value.includes("limite total")), false);
  assert.equal(descriptions.some((value) => value.includes("pagamento recebido")), false);

  const parcela2de2 = result.items.find((item) => item.descricao.toLowerCase().includes("mad vestuario"));
  assert.ok(parcela2de2);
  assert.equal(parcela2de2?.parcelaAtual, 2);
  assert.equal(parcela2de2?.parcelas, 2);
  assert.equal(parcela2de2?.dataCompra, "2026-03-17");
  assert.equal(parcela2de2?.valorParcela, 163.42);

  const parcela5de10 = result.items.find((item) => item.descricao.toLowerCase().includes("amazonmktplc"));
  assert.ok(parcela5de10);
  assert.equal(parcela5de10?.parcelaAtual, 5);
  assert.equal(parcela5de10?.parcelas, 10);
  assert.equal(parcela5de10?.dataCompra, "2026-03-17");
  assert.equal(parcela5de10?.valorParcela, 53.01);

  const parcela1de2 = result.items.find((item) => item.descricao.toLowerCase().includes("mp hasag"));
  assert.ok(parcela1de2);
  assert.equal(parcela1de2?.parcelaAtual, 1);
  assert.equal(parcela1de2?.parcelas, 2);
  assert.equal(parcela1de2?.dataCompra, "2026-04-01");

  const compraAvista = result.items.find((item) => item.descricao.toLowerCase().includes("dl uberrides"));
  assert.ok(compraAvista);
  assert.equal(compraAvista?.parcelaAtual, 1);
  assert.equal(compraAvista?.parcelas, 1);
  assert.equal(compraAvista?.valorParcela, 37.94);
});

test("import parser: PDF Itau importa apenas lancamentos reais da secao de compras e saques", () => {
  const pdfText = [
    "Itaucard",
    "Resumo da fatura em R$",
    "Pagamento via conta -924,85",
    "Total dos pagamentos -924,85",
    "Vencimento 22/04/2026",
    "Emissao 14/04/2026",
    "Lancamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "04/09 Shopee*SHOPEE* 08/12 224,91",
    "18/09 EC *LGELECTRON 07/12 410,67",
    "11/12 PG *WEBFONES W 05/06 108,16",
    "25/03 NETFLIX ENTRETENIMENTOB 59,90",
    "25/03 EBN *PLAYST 01/02 99,59",
    "02/04 EBN *PLAYST 01/04 21,62",
    "Total dos lancamentos atuais 0,00",
    "Compras parceladas - proximas faturas",
    "Proxima fatura",
    "Limite total de credito",
    "Encargos cobrados nesta fatura",
    "Juros",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-itau", { referenceBillingDate: "2026-04-22" });
  assert.equal(result.issuerDetected, "itau");
  assert.equal(result.parserUsed, "itau_textual_pdf");
  assert.equal(result.items.length, 6);

  const descriptions = result.items.map((item) => item.descricao.toLowerCase());
  assert.equal(descriptions.some((value) => value.includes("pagamento via conta")), false);
  assert.equal(descriptions.some((value) => value.includes("total dos pagamentos")), false);
  assert.equal(descriptions.some((value) => value.includes("total dos lancamentos atuais")), false);
  assert.equal(descriptions.some((value) => value.includes("proxima fatura")), false);
  assert.equal(descriptions.some((value) => value.includes("limite total")), false);

  const shopee = result.items.find((item) => item.descricao.toLowerCase().includes("shopee"));
  assert.ok(shopee);
  assert.equal(shopee?.parcelaAtual, 8);
  assert.equal(shopee?.parcelas, 12);
  assert.equal(shopee?.valorParcela, 224.91);
  assert.equal(shopee?.dataCompra, "2025-09-04");

  const lge = result.items.find((item) => item.descricao.toLowerCase().includes("lgelectron"));
  assert.ok(lge);
  assert.equal(lge?.parcelaAtual, 7);
  assert.equal(lge?.parcelas, 12);
  assert.equal(lge?.dataCompra, "2025-09-18");

  const webfones = result.items.find((item) => item.descricao.toLowerCase().includes("webfones"));
  assert.ok(webfones);
  assert.equal(webfones?.parcelaAtual, 5);
  assert.equal(webfones?.parcelas, 6);
  assert.equal(webfones?.dataCompra, "2025-12-11");

  const netflix = result.items.find((item) => item.descricao.toLowerCase().includes("netflix"));
  assert.ok(netflix);
  assert.equal(netflix?.parcelaAtual, 1);
  assert.equal(netflix?.parcelas, 1);
  assert.equal(netflix?.dataCompra, "2026-03-25");

  const playst = result.items.find((item) => item.descricao.toLowerCase().includes("playst"));
  assert.ok(playst);
  assert.equal(playst?.dataCompra, "2026-03-25");

  const playstAbr = result.items.find((item) => item.dataCompra === "2026-04-02");
  assert.ok(playstAbr);
});

test("import parser: PDF Itau com texto quebrado importa compras reais e ignora blocos de resumo", () => {
  const pdfText = [
    "Estamos lhe enviando esta para simples confer ê ncia...",
    "Limite de cr é dito R$ 2.900,00",
    "Itaúcard",
    "Lan ç amentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "25/03 NETFLIX ENTRETENIMENTOB 59,90",
    "02/04 EBN *PLAYST 01/04 21,62",
    "4004 4828 0800 970 4828 P L Pagamentos efetuados EM Pagamento via conta -924,85",
    "Compras parceladas - pr ó ximas faturas",
    "Demais faturas 1.910,79",
    "Simula çã o de Compras parc. c/ juros e Credi á rio",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-itau", { referenceBillingDate: "2026-04-22" });
  assert.equal(result.issuerDetected, "itau");
  assert.equal(result.parserUsed, "itau_textual_pdf");
  assert.equal(result.items.length, 2);
  assert.equal(result.items.some((item) => item.valorParcela === 2900), false);
  assert.equal(result.items.some((item) => item.valorParcela === 1910.79), false);
  assert.equal(result.items.some((item) => item.descricao.toLowerCase().includes("estamos lhe enviando")), false);
  assert.equal(result.items.some((item) => item.descricao.toLowerCase().includes("simulacao")), false);
});

test("import parser: PDF Itau sem datas nao cai no generico e retorna warning seguro", () => {
  const pdfText = [
    "Itaúcard",
    "Lan ç amentos: compras e saques",
    "NETFLIX ENTRETENIMENTOB 59,90",
    "EBN *PLAYST 01/04 21,62",
    "Compras parceladas - pr ó ximas faturas",
    "Demais faturas 1.910,79",
    "Limite de cr é dito R$ 2.900,00",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-itau", { referenceBillingDate: "2026-04-22" });
  assert.equal(result.issuerDetected, "itau");
  assert.equal(result.parserUsed, "itau_textual_pdf");
  assert.equal(result.items.length, 0);
  assert.equal(result.parserWarnings?.some((warning) => warning.toLowerCase().includes("parece ser itau")), true);
});

test("import parser: PDF Itau com linhas coladas ainda extrai 6 compras reais", () => {
  const collapsedSectionLine = [
    "04/09 Shopee*SHOPEE* 08/12 224,91",
    "18/09 EC *LGELECTRON 07/12 410,67",
    "11/12 PG *WEBFONES W 05/06 108,16",
    "25/03 NETFLIX ENTRETENIMENTOB 59,90",
    "25/03 EBN *PLAYST 01/02 99,59",
    "02/04 EBN *PLAYST 01/04 21,62",
    "Compras parceladas - proximas faturas",
    "Demais faturas 1.910,79",
  ].join(" ");

  const pdfText = [
    "Itaúcard",
    "Resumo da fatura em R$",
    "Pagamento via conta -924,85",
    "Vencimento 22/04/2026",
    "Lançamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    collapsedSectionLine,
    "Limites de crédito",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-itau", { referenceBillingDate: "2026-04-22" });
  assert.equal(result.issuerDetected, "itau");
  assert.equal(result.parserUsed, "itau_textual_pdf");
  assert.equal(result.items.length, 6);
  assert.equal(result.items.some((item) => item.valorParcela === 1910.79), false);
  assert.equal(result.items.some((item) => item.descricao.toLowerCase().includes("demais faturas")), false);
  assert.equal(result.items.some((item) => item.descricao.toLowerCase().includes("pagamento via conta")), false);
});

test("import parser: seção Itau não encerra em linha auxiliar 'outros' e só termina em marcador oficial", () => {
  const pdfText = [
    "Itaúcard",
    "Resumo da fatura em R$",
    "Vencimento 22/04/2026",
    "Lançamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "04/09 Shopee*SHOPEE* 08/12 224,91",
    "outros Guarulhos",
    "18/09 EC *LGELECTRON 07/12 410,67",
    "ELETRONICS TAUBATE",
    "11/12 PG *WEBFONES W 05/06 108,16",
    "outros SAO PAULO",
    "25/03 NETFLIX ENTRETENIMENTOB 59,90",
    "25/03 EBN *PLAYST 01/02 99,59",
    "02/04 EBN *PLAYST 01/04 21,62",
    "Compras parceladas - próximas faturas",
    "Demais faturas 1.910,79",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-itau", { referenceBillingDate: "2026-04-22", issuerHint: "itau" });
  assert.equal(result.items.length, 6);
  assert.equal(result.items.some((item) => item.valorParcela === 1910.79), false);
});

test("import parser: PDF Itau ignora seção de compras parceladas - próximas faturas", () => {
  const pdfText = [
    "Itaúcard",
    "Resumo da fatura em R$",
    "Vencimento 22/04/2026",
    "Lançamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "04/09 Shopee*SHOPEE* 08/12 224,91",
    "18/09 EC *LGELECTRON 07/12 410,67",
    "11/12 PG *WEBFONES W 05/06 108,16",
    "25/03 NETFLIX ENTRETENIMENTOB 59,90",
    "25/03 EBN *PLAYST 01/02 99,59",
    "02/04 EBN *PLAYST 01/04 21,62 Compras parceladas - próximas faturas 04/09 Shopee*SHOPEE* 09/12 224,91",
    "18/09 EC *LGELECTRON 08/12 410,67",
    "11/12 PG *WEBFONES W 06/06 108,16",
    "25/03 EBN *PLAYST 02/02 99,59",
    "02/04 EBN *PLAYST 02/04 21,62",
    "Total para próximas faturas 1.910,79",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-itau", { referenceBillingDate: "2026-04-22", issuerHint: "itau" });

  assert.equal(result.items.length, 6);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("SHOPEE") && item.parcelaAtual === 9), false);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("LGELECTRON") && item.parcelaAtual === 8), false);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("WEBFONES") && item.parcelaAtual === 6), false);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("PLAYST") && item.parcelaAtual === 2 && item.parcelas === 2), false);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("PLAYST") && item.parcelaAtual === 2 && item.parcelas === 4), false);

  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("SHOPEE") && item.parcelaAtual === 8), true);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("LGELECTRON") && item.parcelaAtual === 7), true);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("WEBFONES") && item.parcelaAtual === 5), true);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("NETFLIX")), true);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("PLAYST") && item.parcelaAtual === 1 && item.parcelas === 2), true);
  assert.equal(result.items.some((item) => item.descricao.toUpperCase().includes("PLAYST") && item.parcelaAtual === 1 && item.parcelas === 4), true);
});

test("import parser: Itau usa fallback plain quando extração posicional vier incompleta", () => {
  const positionalIncomplete = [
    "Itaúcard",
    "Lançamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    ".",
    "04/09 Shopee*SHOPEE* 08/12 224,91",
    "outros Guarulhos",
  ].join("\n");

  const plainFallback = [
    "Itaúcard",
    "Resumo da fatura em R$",
    "Vencimento 22/04/2026",
    "Lançamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "04/09 Shopee*SHOPEE* 08/12 224,91",
    "18/09 EC *LGELECTRON 07/12 410,67",
    "11/12 PG *WEBFONES W 05/06 108,16",
    "25/03 NETFLIX ENTRETENIMENTOB 59,90",
    "25/03 EBN *PLAYST 01/02 99,59",
    "02/04 EBN *PLAYST 01/04 21,62",
    "Compras parceladas - próximas faturas",
  ].join("\n");

  const result = parsePdf(positionalIncomplete, [], "cartao-itau", {
    referenceBillingDate: "2026-04-22",
    issuerHint: "itau",
    itauFallbackContent: plainFallback,
  });
  assert.equal(result.items.length, 6);
  assert.equal(result.parserUsed, "itau_textual_pdf_fallback_plain");
});

test("import parser: PDF desconhecido usa parser generico com revisão obrigatoria", () => {
  const pdfText = [
    "Fatura do Cartao XPTO",
    "12/04 MERCADO CENTRAL 90,00 1/1",
    "13/04 PADARIA DO BAIRRO 25,00",
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-1", {
    referenceBillingDate: "2026-04-20",
  });

  assert.equal(result.issuerDetected, "unknown");
  assert.equal(result.parserUsed, "generic_pdf_fallback");
  assert.equal(result.items.length, 2);
  assert.equal(result.items.every((item) => item.reviewRequired === true), true);
  assert.equal(
    result.items.every((item) =>
      (item.validationIssues ?? []).some((issue) =>
        issue.toLowerCase().includes("emissor da fatura nao identificado"),
      ),
    ),
    true,
  );
});

test("import parser: parser generico ignora bloco gigante de resumo com palavras sensiveis", () => {
  const hugeNoise = `Resumo da fatura em R$ Total desta fatura Limite total de credito Simulacao de crediario Telefone 4004 4828 0800 970 4828 ${
    "x".repeat(220)
  } 2.900,00`;
  const pdfText = [
    "Fatura banco desconhecido",
    hugeNoise,
  ].join("\n");

  const result = parsePdf(pdfText, [], "cartao-unknown", { referenceBillingDate: "2026-04-22" });
  assert.equal(result.issuerDetected, "unknown");
  assert.equal(result.items.length, 0);
});

test("import parser: OFX e QFX continuam funcionando via parseOfx", () => {
  const content = [
    "<OFX>",
    "<STMTTRN>",
    "<TRNTYPE>DEBIT",
    "<DTPOSTED>20260412",
    "<TRNAMT>37.94",
    "<MEMO>Dl*Uberrides",
    "</STMTTRN>",
  ].join("\n");

  const parsedOfx = parseOfx(content, [], "cartao-1");
  const parsedQfx = parseOfx(content, [], "cartao-1");

  assert.equal(parsedOfx.items.length, 1);
  assert.equal(parsedQfx.items.length, 1);
  assert.equal(parsedOfx.items[0]?.descricao.toLowerCase().includes("uberrides"), true);
  assert.equal(parsedQfx.items[0]?.descricao.toLowerCase().includes("uberrides"), true);
});

test("import parser: CSV Itau ignora pagamento negativo, limpa sufixo de cidade/UF e importa compras positivas", () => {
  const csv = [
    "data,lançamento,valor",
    "2026-04-07,PAGAMENTO COM SALDO,-924.85",
    "2026-04-02,EBN *PLAYSTATIONCURITIBABR,21.62",
    "2026-03-25,NETFLIX ENTRETENIMENTOBARUERIBR,59.9",
    "2026-03-24,EC *LGELECTRONICSTAUBATEBR,410.67",
    "2026-03-23,PG *WEBFONES WEBFSAO PAULOBR,108.16",
    "2026-03-22,SHOPEE*SHOPEE* IFGUARULHOSBR,224.91",
    "2026-03-21,BARUERI SHOPPING CENTER,80.00",
  ].join("\n");

  const parsed = parseCsv(csv, [], "cartao-itau");
  assert.equal(parsed.issuerDetected, "itau");
  assert.equal(parsed.parserUsed, "itau_csv");
  assert.equal(parsed.items.length, 6);
  assert.equal(parsed.items.some((item) => item.descricao.toLowerCase().includes("pagamento com saldo")), false);

  const playstation = parsed.items.find((item) => item.dataCompra === "2026-04-02");
  assert.equal(playstation?.descricao, "Ebn Playstation");

  const netflix = parsed.items.find((item) => item.dataCompra === "2026-03-25");
  assert.equal(netflix?.descricao, "Netflix Entretenimento");

  const lge = parsed.items.find((item) => item.dataCompra === "2026-03-24");
  assert.equal(lge?.descricao, "Ec Lgelectronics");

  const webfones = parsed.items.find((item) => item.dataCompra === "2026-03-23");
  assert.equal(webfones?.descricao, "Pg Webfones Webf");

  const shopee = parsed.items.find((item) => item.dataCompra === "2026-03-22");
  assert.equal(shopee?.descricao, "Shopee Shopee If");

  const nonSuffixCase = parsed.items.find((item) => item.dataCompra === "2026-03-21");
  assert.equal(nonSuffixCase?.descricao, "Barueri Shopping Center");
});

test("import parser: deduplicação considera descrição CSV Itau normalizada", () => {
  const csv = [
    "data,lançamento,valor",
    "2026-03-25,NETFLIX ENTRETENIMENTOBARUERIBR,59.90",
  ].join("\n");

  const existentes = [{
    id: "compra-1",
    userId: "user-1",
    cartaoId: "cartao-itau",
    descricao: "Netflix Entretenimento",
    valorTotal: "59.90",
    parcelas: 1,
    parcelaAtual: 1,
    valorParcela: "59.90",
    dataCompra: "2026-03-25",
    pessoaId: null,
    statusPessoa: null,
    dataPagamentoPessoa: null,
  }];

  const parsed = parseCsv(csv, existentes, "cartao-itau");
  assert.equal(parsed.items.length, 1);
  assert.ok(parsed.items[0]?.duplicata);
  assert.equal(parsed.items[0]?.action, "skip");
});

test("import parser: mismatch Nubank x Inter pode ser detectado pelo sugestor de emissor", () => {
  const cards = [
    {
      id: "cartao-inter",
      userId: "user-1",
      nome: "Inter",
      limite: "800.00",
      melhorDiaCompra: 5,
      diaVencimento: 10,
      iconeId: null,
    },
    {
      id: "cartao-nubank",
      userId: "user-1",
      nome: "Nubank Mastercard",
      limite: "3000.00",
      melhorDiaCompra: 10,
      diaVencimento: 20,
      iconeId: null,
    },
  ] as Cartao[];

  const suggestion = suggestImportCardByText("Nubank fatura de abril", cards);
  assert.equal(suggestion.kind, "single_match");
  if (suggestion.kind === "single_match") {
    assert.equal(suggestion.card.id, "cartao-nubank");
  }
});

test("import parser: texto Nubank com cartao Inter marca revisão forte", () => {
  const pdfText = [
    "FATURA 24 ABR 2026",
    "NUBANK",
    "TRANSAÇÕES DE 17 MAR A 17 ABR",
    "12 ABR Dl*Uberrides R$ 37,94",
  ].join("\n");

  const parsed = parseNubankInvoiceText(pdfText, {
    selectedCardName: "Inter",
    referenceBillingDate: "2026-04-24",
  });

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.reviewRequired, true);
  assert.equal(
    parsed[0]?.validationIssues?.some((issue) => issue.toLowerCase().includes("parece ser nubank")),
    true,
  );
});

test("import parser: texto Itau com cartao Inter marca revisão forte", () => {
  const pdfText = [
    "ITAUCARD",
    "Vencimento 22/04/2026",
    "Lancamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "02/04 EBN *PLAYST 01/04 21,62",
  ].join("\n");

  const parsed = parseItauInvoiceText(pdfText, {
    selectedCardName: "Inter",
    referenceBillingDate: "2026-04-22",
  });

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.reviewRequired, true);
  assert.equal(
    parsed[0]?.validationIssues?.some((issue) => issue.toLowerCase().includes("parece ser itau")),
    true,
  );
});

test("import parser: detecta candidatos recorrentes de serviço com match forte", () => {
  const spotify = detectRecurringServiceCandidate("Dm*Spotify");
  const netflix = detectRecurringServiceCandidate("NETFLIX.COM");
  const seguro = detectRecurringServiceCandidate("Nu Seguro Vida");

  assert.equal(spotify.isServiceCandidate, true);
  assert.equal(spotify.matchedProvider, "Spotify");
  assert.equal(netflix.isServiceCandidate, true);
  assert.equal(netflix.matchedProvider, "Netflix");
  assert.equal(seguro.isServiceCandidate, true);
  assert.equal(seguro.categorySuggestion, "seguro");
});

test("import parser: nao marca compras comuns como serviço recorrente", () => {
  const uber = detectRecurringServiceCandidate("Uber Uber *Trip Help.U");
  const cinemark = detectRecurringServiceCandidate("Cinemark Brasil S.A Ec");
  const amazonCompra = detectRecurringServiceCandidate("Amazonmktplc*Ikaraindu");

  assert.equal(uber.isServiceCandidate, false);
  assert.equal(cinemark.isServiceCandidate, false);
  assert.equal(amazonCompra.isServiceCandidate, false);
});

test("import parser: candidato de serviço não cria vínculo automático", () => {
  const csv = [
    "Data;Descricao;Valor",
    "06/05/2026;DM*Spotify;21,90",
  ].join("\n");

  const parsed = parseCsv(csv, [], "cartao-1");
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0]?.recurringServiceCandidate?.isServiceCandidate, true);
  assert.equal(parsed.items[0]?.serviceSuggestionAction, "ignore");
  assert.equal(parsed.items[0]?.linkedServiceId, null);
});

test("import parser: valida assinatura magic bytes de PDF", () => {
  const validPdf = Buffer.from("%PDF-1.7\n1 0 obj\n");
  const invalidPdf = Buffer.from("NOTPDF");

  assert.equal(hasPdfMagicBytes(validPdf.buffer.slice(validPdf.byteOffset, validPdf.byteOffset + validPdf.byteLength)), true);
  assert.equal(hasPdfMagicBytes(invalidPdf.buffer.slice(invalidPdf.byteOffset, invalidPdf.byteOffset + invalidPdf.byteLength)), false);
});

test("import parser: detecta texto extraivel minimo de PDF", () => {
  assert.equal(isExtractedPdfTextUsable(""), false);
  assert.equal(isExtractedPdfTextUsable("    "), false);
  assert.equal(isExtractedPdfTextUsable("R$ 90,00"), false);
  assert.equal(isExtractedPdfTextUsable("06/05 Loja Central parcela 1/3 valor 120,00"), true);
});

test("import parser: reconstrói linhas posicionais por coordenada Y/X", () => {
  const items = [
    { str: "04", transform: [1, 0, 0, 1, 12, 700], width: 8, height: 10 },
    { str: "/", transform: [1, 0, 0, 1, 20.5, 700], width: 3, height: 10 },
    { str: "09", transform: [1, 0, 0, 1, 24, 700], width: 8, height: 10 },
    { str: "Shopee*SHOPEE*", transform: [1, 0, 0, 1, 40, 700], width: 78, height: 10 },
    { str: "08", transform: [1, 0, 0, 1, 122, 700], width: 8, height: 10 },
    { str: "/", transform: [1, 0, 0, 1, 130.5, 700], width: 3, height: 10 },
    { str: "12", transform: [1, 0, 0, 1, 134, 700], width: 8, height: 10 },
    { str: "224", transform: [1, 0, 0, 1, 148, 700], width: 14, height: 10 },
    { str: ",", transform: [1, 0, 0, 1, 162.5, 700], width: 3, height: 10 },
    { str: "91", transform: [1, 0, 0, 1, 166, 700], width: 8, height: 10 },
    { str: "18/09", transform: [1, 0, 0, 1, 12, 684], width: 20, height: 10 },
    { str: "EC", transform: [1, 0, 0, 1, 38, 684], width: 10, height: 10 },
    { str: "*LGELECTRON", transform: [1, 0, 0, 1, 52, 684], width: 64, height: 10 },
    { str: "07/12", transform: [1, 0, 0, 1, 122, 684], width: 20, height: 10 },
    { str: "410,67", transform: [1, 0, 0, 1, 148, 684], width: 24, height: 10 },
  ] as const;

  const lines = reconstructPdfLinesByPosition(items);
  assert.equal(lines.length >= 2, true);
  assert.equal(lines.some((line) => line.includes("04/09 Shopee*SHOPEE* 08/12 224,91")), true);
  assert.equal(lines.some((line) => line.includes("18/09 EC *LGELECTRON 07/12 410,67")), true);
});

test("import parser: texto reconstruído posicional do Itau gera compras reais", () => {
  const lines = [
    "Itaúcard",
    "Resumo da fatura em R$",
    "Vencimento 22/04/2026",
    "Lançamentos: compras e saques",
    "DATA ESTABELECIMENTO VALOR EM R$",
    "04/09 Shopee*SHOPEE* 08/12 224,91",
    "18/09 EC *LGELECTRON 07/12 410,67",
    "11/12 PG *WEBFONES W 05/06 108,16",
    "25/03 NETFLIX ENTRETENIMENTOB 59,90",
    "25/03 EBN *PLAYST 01/02 99,59",
    "02/04 EBN *PLAYST 01/04 21,62",
    "Total dos lançamentos atuais 0,00",
    "Compras parceladas - próximas faturas",
  ];

  const positionalItems: Array<{ str: string; transform: number[]; width: number; height: number }> = [];
  let y = 760;
  for (const line of lines) {
    let x = 10;
    for (const token of line.split(/\s+/)) {
      positionalItems.push({
        str: token,
        transform: [1, 0, 0, 1, x, y],
        width: Math.max(token.length * 4.6, 4),
        height: 10,
      });
      x += Math.max(token.length * 4.6, 4) + 2.2;
    }
    y -= 14;
  }

  const reconstructedText = reconstructPdfLinesByPosition(positionalItems).join("\n");
  const parsed = parsePdf(reconstructedText, [], "cartao-itau", {
    referenceBillingDate: "2026-04-22",
    issuerHint: "itau",
  });

  assert.equal(parsed.issuerDetected, "itau");
  assert.equal(parsed.items.length, 6);
  assert.equal(parsed.items.some((item) => item.descricao.toLowerCase().includes("shopee")), true);
  assert.equal(parsed.items.some((item) => item.descricao.toLowerCase().includes("netflix")), true);
  assert.equal(parsed.items.some((item) => item.valorParcela === 1910.79), false);
});

test("import parser: extrai texto de PDF textual valido", async () => {
  const minimalTextPdfBase64 =
    "JVBERi0xLjIKCjkgMCBvYmoKPDwKPj4Kc3RyZWFtCkJULyA5IFRmKFRlc3QpJyBFVAplbmRzdHJlYW0KZW5kb2JqCjQgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCA1IDAgUgovQ29udGVudHMgOSAwIFIKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL0tpZHNbNCAwIFIgXQovQ291bnQgMQovVHlwZSAvUGFnZXMKL01lZGlhQm94IFsgMCAwIDk5IDkgXQo+PgplbmRvYmoKMyAwIG9iago8PAovUGFnZXMgNSAwIFIKL1R5cGUgL0NhdGFsb2cKPj4KZW5kb2JqCnRyYWlsZXIKPDwKL1Jvb3QgMyAwIFIKPj4KJSVFT0Y=";
  const buffer = Buffer.from(minimalTextPdfBase64, "base64");
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const text = await extractTextFromPdfBuffer(arrayBuffer);
  assert.match(text.toLowerCase(), /test/);
});
