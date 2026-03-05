import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth } from "./auth";
import { z } from "zod";
import { addMonths, format, parseISO, addDays } from "date-fns";
import { insertRendaSchema, insertPatrimonioSchema } from "@shared/schema";

const pessoaBody = z.object({
  nome: z.string().min(1),
  tipo: z.enum(["me_deve", "eu_devo"]),
  telefone: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

const dividaBody = z.object({
  pessoaId: z.string().min(1),
  tipo: z.enum(["receber", "pagar"]),
  valor: z.string().or(z.number()).transform(String),
  dataVencimento: z.string().nullable().optional(),
  status: z.string().optional().default("pendente"),
  dataPagamento: z.string().optional().nullable(),
  formaPagamento: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
  totalParcelas: z.coerce.number().int().optional().nullable(),
  valorTotal: z.string().or(z.number()).transform(String).optional().nullable(),
});

const dividaParceladoBody = z.object({
  pessoaId: z.string().min(1),
  tipo: z.enum(["receber", "pagar"]),
  valorTotal: z.string().or(z.number()).transform(Number),
  totalParcelas: z.coerce.number().int().min(1).max(360),
  primeiroVencimento: z.string().min(1),
  descricao: z.string().optional().nullable(),
  formaPagamento: z.string().optional().nullable(),
});

const dividaUpdate = z.object({
  status: z.string().optional(),
  dataPagamento: z.string().optional().nullable(),
  formaPagamento: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
}).passthrough();

const parcelaUpdate = z.object({
  status: z.string().optional(),
  dataPagamento: z.string().optional().nullable(),
  formaPagamento: z.string().optional().nullable(),
  valor: z.string().or(z.number()).transform(String).optional(),
  dataVencimento: z.string().optional(),
});

const cartaoBody = z.object({
  nome: z.string().min(1),
  limite: z.string().or(z.number()).transform(String),
  melhorDiaCompra: z.coerce.number().int().min(1).max(31),
  diaVencimento: z.coerce.number().int().min(1).max(31),
});

const compraBody = z.object({
  cartaoId: z.string().min(1),
  descricao: z.string().min(1),
  valorTotal: z.string().or(z.number()).transform(String),
  parcelas: z.coerce.number().int().min(1),
  parcelaAtual: z.coerce.number().int().min(1),
  valorParcela: z.string().or(z.number()).transform(String),
  dataCompra: z.string().min(1),
  pessoaId: z.string().optional().nullable(),
});

const servicoBody = z.object({
  nome: z.string().min(1),
  categoria: z.string().min(1),
  valorMensal: z.string().or(z.number()).transform(String),
  dataCobranca: z.coerce.number().int().min(1).max(31),
  formaPagamento: z.string().min(1),
  status: z.string().optional().default("ativo"),
});

const servicoPessoaBody = z.object({
  servicoId: z.string().min(1),
  pessoaId: z.string().min(1),
  valorDevido: z.string().or(z.number()).transform(String),
});

const servicoPagamentoBody = z.object({
  servicoPessoaId: z.string().min(1),
  mes: z.string().min(7).max(7),
  status: z.string().optional().default("pago"),
  dataPagamento: z.string().optional().nullable(),
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  setupAuth(app);

  app.get("/api/pessoas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await storage.getPessoas(userId));
  });
  app.post("/api/pessoas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = pessoaBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.createPessoa({ ...parsed.data, userId }));
  });
  app.patch("/api/pessoas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = pessoaBody.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const p = await storage.updatePessoa(req.params.id, userId, parsed.data);
    if (!p) return res.status(404).json({ message: "Not found" });
    res.json(p);
  });
  app.delete("/api/pessoas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const deleted = await storage.deletePessoa(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/dividas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await storage.getDividas(userId));
  });
  app.get("/api/dividas/pessoa/:pessoaId", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await storage.getDividasByPessoa(req.params.pessoaId, userId));
  });
  app.post("/api/dividas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = dividaBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const pessoa = await storage.getPessoa(parsed.data.pessoaId, userId);
    if (!pessoa) return res.status(400).json({ message: "Pessoa not found" });
    res.json(await storage.createDivida({ ...parsed.data, userId }));
  });
  app.post("/api/dividas/parcelado", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = dividaParceladoBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const { pessoaId, tipo, valorTotal, totalParcelas, primeiroVencimento, descricao, formaPagamento } = parsed.data;
    const pessoa = await storage.getPessoa(pessoaId, userId);
    if (!pessoa) return res.status(400).json({ message: "Pessoa not found" });
    const valorParcela = Number((valorTotal / totalParcelas).toFixed(2));
    const firstDate = new Date(primeiroVencimento + "T12:00:00");
    const divida = await storage.createDivida({
      userId, pessoaId, tipo, valor: String(valorParcela),
      dataVencimento: primeiroVencimento, status: "pendente",
      descricao: descricao ?? null, formaPagamento: formaPagamento ?? null,
      totalParcelas, valorTotal: String(valorTotal),
    });
    const parcelasData = Array.from({ length: totalParcelas }, (_, i) => ({
      userId, dividaId: divida.id, numero: i + 1,
      valor: i === totalParcelas - 1
        ? String(Number((valorTotal - valorParcela * (totalParcelas - 1)).toFixed(2)))
        : String(valorParcela),
      dataVencimento: format(addMonths(firstDate, i), "yyyy-MM-dd"),
      status: "pendente", dataPagamento: null, formaPagamento: null,
    }));
    const parcelas = await storage.createParcelasBulk(parcelasData);
    res.json({ divida, parcelas });
  });
  app.patch("/api/dividas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = dividaUpdate.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const d = await storage.updateDivida(req.params.id, userId, parsed.data);
    if (!d) return res.status(404).json({ message: "Not found" });
    res.json(d);
  });
  app.delete("/api/dividas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    await storage.deleteParcelasByDivida(req.params.id, userId);
    const deleted = await storage.deleteDivida(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/parcelas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await storage.getParcelas(userId));
  });
  app.get("/api/parcelas/divida/:dividaId", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const result = await storage.getParcelasByDivida(req.params.dividaId, userId);
    res.json(result.sort((a, b) => a.numero - b.numero));
  });
  app.patch("/api/parcelas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = parcelaUpdate.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const p = await storage.updateParcela(req.params.id, userId, parsed.data);
    if (!p) return res.status(404).json({ message: "Not found" });
    res.json(p);
  });
  app.post("/api/parcelas/antecipar", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const { dividaId, quantidade, formaPagamento } = req.body;
    if (!dividaId || !quantidade) return res.status(400).json({ message: "dividaId e quantidade obrigatorios" });
    const all = await storage.getParcelasByDivida(dividaId, userId);
    const pendentes = all.filter((p) => p.status === "pendente").sort((a, b) => a.numero - b.numero).slice(0, quantidade);
    const hoje = format(new Date(), "yyyy-MM-dd");
    const updated = await Promise.all(pendentes.map((p) => storage.updateParcela(p.id, userId, { status: "pago", dataPagamento: hoje, formaPagamento: formaPagamento || "pix" })));
    const allUpdated = await storage.getParcelasByDivida(dividaId, userId);
    const todasPagas = allUpdated.every((p) => p.status === "pago");
    if (todasPagas) await storage.updateDivida(dividaId, userId, { status: "pago", dataPagamento: hoje, formaPagamento: formaPagamento || "pix" });
    res.json({ updated: updated.length, todasPagas });
  });
  app.delete("/api/parcelas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const deleted = await storage.deleteParcela(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/cartoes", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await storage.getCartoes(userId));
  });
  app.post("/api/cartoes", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = cartaoBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.createCartao({ ...parsed.data, userId }));
  });
  app.patch("/api/cartoes/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const c = await storage.updateCartao(req.params.id, userId, req.body);
    if (!c) return res.status(404).json({ message: "Not found" });
    res.json(c);
  });
  app.delete("/api/cartoes/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const deleted = await storage.deleteCartao(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/compras-cartao", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await storage.getComprasCartao(userId));
  });
  app.get("/api/compras-cartao/cartao/:cartaoId", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await storage.getComprasByCartao(req.params.cartaoId, userId));
  });
  app.get("/api/compras-cartao/pessoa/:pessoaId", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await storage.getComprasByPessoa(req.params.pessoaId, userId));
  });
  app.post("/api/compras-cartao", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = compraBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const cartao = await storage.getCartao(parsed.data.cartaoId, userId);
    if (!cartao) return res.status(400).json({ message: "Cartao not found" });
    res.json(await storage.createCompraCartao({ ...parsed.data, userId }));
  });
  app.patch("/api/compras-cartao/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const c = await storage.updateCompraCartao(req.params.id, userId, req.body);
    if (!c) return res.status(404).json({ message: "Not found" });
    res.json(c);
  });
  app.delete("/api/compras-cartao/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const deleted = await storage.deleteCompraCartao(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/servicos", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await storage.getServicos(userId));
  });
  app.post("/api/servicos", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = servicoBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.createServico({ ...parsed.data, userId }));
  });
  app.patch("/api/servicos/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const s = await storage.updateServico(req.params.id, userId, req.body);
    if (!s) return res.status(404).json({ message: "Not found" });
    res.json(s);
  });
  app.delete("/api/servicos/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const deleted = await storage.deleteServico(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/servico-pessoas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await storage.getServicoPessoas(userId));
  });
  app.post("/api/servico-pessoas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = servicoPessoaBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.createServicoPessoa({ ...parsed.data, userId }));
  });
  app.patch("/api/servico-pessoas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const p = await storage.updateServicoPessoa(req.params.id, userId, req.body);
    if (!p) return res.status(404).json({ message: "Not found" });
    res.json(p);
  });
  app.delete("/api/servico-pessoas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    await storage.deleteServicoPagamentosByServicoPessoa(req.params.id, userId);
    const deleted = await storage.deleteServicoPessoa(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/servico-pagamentos", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await storage.getServicoPagamentos(userId));
  });
  app.post("/api/servico-pagamentos", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = servicoPagamentoBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.createServicoPagamento({ ...parsed.data, userId }));
  });
  app.delete("/api/servico-pagamentos/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const deleted = await storage.deleteServicoPagamento(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  const metaBody = z.object({
    nome: z.string().min(1),
    descricao: z.string().optional().nullable(),
    valorAlvo: z.string().or(z.number()).transform(String),
    valorAtual: z.string().or(z.number()).transform(String).optional().default("0"),
    prazo: z.string().min(1),
    status: z.string().optional().default("ativa"),
  });
  app.get("/api/metas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await storage.getMetas(userId));
  });
  app.post("/api/metas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = metaBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    res.json(await storage.createMeta({ ...parsed.data, userId }));
  });
  app.patch("/api/metas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const m = await storage.updateMeta(req.params.id, userId, req.body);
    if (!m) return res.status(404).json({ message: "Not found" });
    res.json(m);
  });
  app.delete("/api/metas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const deleted = await storage.deleteMeta(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.post("/api/dividas/:id/recalcular", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const { novoTotal, primeiroVencimento } = req.body;
    if (!novoTotal || novoTotal < 1) return res.status(400).json({ message: "novoTotal obrigatorio" });
    const divida = await storage.getDivida(req.params.id, userId);
    if (!divida) return res.status(404).json({ message: "Not found" });
    const parcelasExistentes = await storage.getParcelasByDivida(req.params.id, userId);
    const pagas = parcelasExistentes.filter((p) => p.status === "pago");
    const pendentes = parcelasExistentes.filter((p) => p.status !== "pago");
    for (const p of pendentes) await storage.deleteParcela(p.id, userId);
    const valorTotal = Number(divida.valorTotal || divida.valor) * Number(divida.totalParcelas || 1);
    const valorParcela = Number((valorTotal / novoTotal).toFixed(2));
    const baseDate = primeiroVencimento
      ? new Date(primeiroVencimento + "T12:00:00")
      : new Date((divida.dataVencimento || format(new Date(), "yyyy-MM-dd")) + "T12:00:00");
    const novasParcelas = [];
    for (let i = pagas.length; i < novoTotal; i++) {
      novasParcelas.push({
        userId, dividaId: divida.id, numero: i + 1,
        valor: i === novoTotal - 1
          ? String(Number((valorTotal - valorParcela * (novoTotal - 1)).toFixed(2)))
          : String(valorParcela),
        dataVencimento: format(addMonths(baseDate, i - pagas.length), "yyyy-MM-dd"),
        status: "pendente", dataPagamento: null, formaPagamento: null,
      });
    }
    const criadas = await storage.createParcelasBulk(novasParcelas);
    await storage.updateDivida(divida.id, userId, {
      totalParcelas: novoTotal,
      valorTotal: String(valorTotal),
      valor: String(valorParcela),
    });
    res.json({ pagas: pagas.length, novas: criadas.length });
  });

  app.get("/api/parcelas-compra/:compraId", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const compraId = req.params.compraId;
    let rows = await storage.getParcelasCompra(compraId, userId);
    if (rows.length === 0) {
      const compra = (await storage.getComprasCartao(userId)).find((c) => c.id === compraId);
      if (!compra) return res.status(404).json({ message: "Compra not found" });
      const valorParcela = Number(compra.valorParcela);
      const total = Number(compra.parcelas);
      const atual = Number(compra.parcelaAtual);
      const baseDate = new Date(compra.dataCompra + "T12:00:00");
      const parcelasData = Array.from({ length: total }, (_, i) => {
        const num = i + 1;
        return {
          userId,
          compraCartaoId: compraId,
          numero: num,
          valor: String(valorParcela),
          dataVencimento: format(addMonths(baseDate, i), "yyyy-MM-dd"),
          statusCartao: num < atual ? "pago" : "pendente",
          dataPagamentoCartao: num < atual ? compra.dataCompra : null,
          statusPessoa: num < atual ? (compra.statusPessoa || null) : (num === atual && compra.pessoaId ? (compra.statusPessoa || "pendente") : null),
          dataPagamentoPessoa: num < atual ? (compra.dataPagamentoPessoa || null) : null,
        };
      });
      rows = await storage.createParcelasCompraBulk(parcelasData);
    }
    res.json(rows);
  });

  app.patch("/api/parcelas-compra/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const p = await storage.updateParcelaCompra(req.params.id, userId, req.body);
    if (!p) return res.status(404).json({ message: "Not found" });
    res.json(p);
  });

  app.post("/api/parcelas-compra/bulk", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const { compraCartaoId, parcelas: rows } = req.body;
    if (!compraCartaoId || !Array.isArray(rows)) return res.status(400).json({ message: "Invalid" });
    await storage.deleteParcelasCompraBulk(compraCartaoId, userId);
    const created = await storage.createParcelasCompraBulk(rows.map((r: any) => ({ ...r, userId, compraCartaoId })));
    res.json(created);
  });

  // ── Rendas ────────────────────────────────────────────────────────────────
  app.get("/api/rendas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await storage.getRendas(userId));
  });
  app.post("/api/rendas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = insertRendaSchema.safeParse({ ...req.body, userId });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    res.json(await storage.createRenda(parsed.data));
  });
  app.patch("/api/rendas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const updated = await storage.updateRenda(req.params.id, userId, req.body);
    if (!updated) return res.status(404).json({ message: "Renda nao encontrada" });
    res.json(updated);
  });
  app.delete("/api/rendas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    await storage.deleteRenda(req.params.id, userId);
    res.json({ success: true });
  });

  // ── Patrimônios ───────────────────────────────────────────────────────────
  app.get("/api/patrimonios", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    res.json(await storage.getPatrimonios(userId));
  });
  app.post("/api/patrimonios", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = insertPatrimonioSchema.safeParse({ ...req.body, userId });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message });
    res.json(await storage.createPatrimonio(parsed.data));
  });
  app.patch("/api/patrimonios/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const updated = await storage.updatePatrimonio(req.params.id, userId, req.body);
    if (!updated) return res.status(404).json({ message: "Patrimonio nao encontrado" });
    res.json(updated);
  });
  app.delete("/api/patrimonios/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    await storage.deletePatrimonio(req.params.id, userId);
    res.json({ success: true });
  });

  app.post("/api/importar-texto", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const { texto, cartaoId } = req.body;
    if (!texto) return res.status(400).json({ message: "Texto obrigatorio" });
    const cartao = await storage.getCartao(cartaoId, userId);
    if (!cartao) return res.status(400).json({ message: "Cartao not found" });
    const existentes = await storage.getComprasCartao(userId);
    const linhas = texto.split(/\n/).map((l: string) => l.trim()).filter(Boolean);
    const items: any[] = [];
    for (const linha of linhas) {
      const valorMatch = linha.match(/R?\$?\s*([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2})/);
      if (!valorMatch) continue;
      const valorStr = valorMatch[1].replace(/\./g, "").replace(",", ".");
      const valor = parseFloat(valorStr);
      if (isNaN(valor) || valor <= 0) continue;
      const parcelaMatch = linha.match(/(\d+)\/(\d+)/);
      const parcelaAtual = parcelaMatch ? parseInt(parcelaMatch[1]) : 1;
      const totalParcelas = parcelaMatch ? parseInt(parcelaMatch[2]) : 1;
      const dataMatch = linha.match(/(\d{2})\/(\d{2})(?:\/(\d{4}))?/);
      let dataCompra = format(new Date(), "yyyy-MM-dd");
      if (dataMatch) {
        const day = dataMatch[1]; const month = dataMatch[2]; const year = dataMatch[3] || String(new Date().getFullYear());
        dataCompra = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
      let descricao = linha
        .replace(valorMatch[0], "")
        .replace(parcelaMatch ? parcelaMatch[0] : "", "")
        .replace(dataMatch ? dataMatch[0] : "", "")
        .replace(/[R$]/g, "")
        .trim()
        .replace(/\s+/g, " ");
      if (!descricao) descricao = "Compra importada";
      const duplicata = existentes.find((e) => {
        const diffValor = Math.abs(Number(e.valorParcela) - valor / totalParcelas) / (valor / totalParcelas);
        const nomeSim = e.descricao.toLowerCase().includes(descricao.toLowerCase().slice(0, 5));
        return diffValor < 0.05 && nomeSim && e.cartaoId === cartaoId;
      });
      items.push({
        descricao, valor, valorParcela: Number((valor / totalParcelas).toFixed(2)),
        parcelas: totalParcelas, parcelaAtual, dataCompra, duplicata: duplicata || null,
      });
    }
    res.json(items);
  });

  return httpServer;
}
