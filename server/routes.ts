import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth } from "./auth";
import { z } from "zod";
import { addMonths, format } from "date-fns";

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
  dataVencimento: z.string().min(1),
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
});

const servicoBody = z.object({
  nome: z.string().min(1),
  categoria: z.string().min(1),
  valorMensal: z.string().or(z.number()).transform(String),
  dataCobranca: z.coerce.number().int().min(1).max(31),
  formaPagamento: z.string().min(1),
  status: z.string().optional().default("ativo"),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  app.get("/api/pessoas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const pessoas = await storage.getPessoas(userId);
    res.json(pessoas);
  });

  app.post("/api/pessoas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = pessoaBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const pessoa = await storage.createPessoa({ ...parsed.data, userId });
    res.json(pessoa);
  });

  app.patch("/api/pessoas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = pessoaBody.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const pessoa = await storage.updatePessoa(req.params.id, userId, parsed.data);
    if (!pessoa) return res.status(404).json({ message: "Not found" });
    res.json(pessoa);
  });

  app.delete("/api/pessoas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const deleted = await storage.deletePessoa(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/dividas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const dividas = await storage.getDividas(userId);
    res.json(dividas);
  });

  app.get("/api/dividas/pessoa/:pessoaId", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const dividas = await storage.getDividasByPessoa(req.params.pessoaId, userId);
    res.json(dividas);
  });

  app.post("/api/dividas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = dividaBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const pessoa = await storage.getPessoa(parsed.data.pessoaId, userId);
    if (!pessoa) return res.status(400).json({ message: "Pessoa not found" });
    const divida = await storage.createDivida({ ...parsed.data, userId });
    res.json(divida);
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
      userId,
      pessoaId,
      tipo,
      valor: String(valorParcela),
      dataVencimento: primeiroVencimento,
      status: "pendente",
      descricao: descricao ?? null,
      formaPagamento: formaPagamento ?? null,
      totalParcelas,
      valorTotal: String(valorTotal),
    });

    const parcelasData = Array.from({ length: totalParcelas }, (_, i) => {
      const dueDate = addMonths(firstDate, i);
      return {
        userId,
        dividaId: divida.id,
        numero: i + 1,
        valor: i === totalParcelas - 1
          ? String(Number((valorTotal - valorParcela * (totalParcelas - 1)).toFixed(2)))
          : String(valorParcela),
        dataVencimento: format(dueDate, "yyyy-MM-dd"),
        status: "pendente",
        dataPagamento: null,
        formaPagamento: null,
      };
    });

    const parcelas = await storage.createParcelasBulk(parcelasData);
    res.json({ divida, parcelas });
  });

  app.patch("/api/dividas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = dividaUpdate.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const divida = await storage.updateDivida(req.params.id, userId, parsed.data);
    if (!divida) return res.status(404).json({ message: "Not found" });
    res.json(divida);
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
    const result = await storage.getParcelas(userId);
    res.json(result);
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
    const parcela = await storage.updateParcela(req.params.id, userId, parsed.data);
    if (!parcela) return res.status(404).json({ message: "Not found" });
    res.json(parcela);
  });

  app.post("/api/parcelas/antecipar", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const { dividaId, quantidade, formaPagamento } = req.body;
    if (!dividaId || !quantidade) return res.status(400).json({ message: "dividaId e quantidade obrigatorios" });

    const all = await storage.getParcelasByDivida(dividaId, userId);
    const pendentes = all
      .filter((p) => p.status === "pendente")
      .sort((a, b) => a.numero - b.numero)
      .slice(0, quantidade);

    const hoje = format(new Date(), "yyyy-MM-dd");
    const updated = await Promise.all(
      pendentes.map((p) =>
        storage.updateParcela(p.id, userId, {
          status: "pago",
          dataPagamento: hoje,
          formaPagamento: formaPagamento || "pix",
        })
      )
    );

    const allUpdated = await storage.getParcelasByDivida(dividaId, userId);
    const todasPagas = allUpdated.every((p) => p.status === "pago");
    if (todasPagas) {
      await storage.updateDivida(dividaId, userId, {
        status: "pago",
        dataPagamento: hoje,
        formaPagamento: formaPagamento || "pix",
      });
    }

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
    const cartoes = await storage.getCartoes(userId);
    res.json(cartoes);
  });

  app.post("/api/cartoes", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = cartaoBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const cartao = await storage.createCartao({ ...parsed.data, userId });
    res.json(cartao);
  });

  app.patch("/api/cartoes/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const cartao = await storage.updateCartao(req.params.id, userId, req.body);
    if (!cartao) return res.status(404).json({ message: "Not found" });
    res.json(cartao);
  });

  app.delete("/api/cartoes/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const deleted = await storage.deleteCartao(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/compras-cartao", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const compras = await storage.getComprasCartao(userId);
    res.json(compras);
  });

  app.get("/api/compras-cartao/cartao/:cartaoId", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const compras = await storage.getComprasByCartao(req.params.cartaoId, userId);
    res.json(compras);
  });

  app.post("/api/compras-cartao", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = compraBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const cartao = await storage.getCartao(parsed.data.cartaoId, userId);
    if (!cartao) return res.status(400).json({ message: "Cartao not found" });
    const compra = await storage.createCompraCartao({ ...parsed.data, userId });
    res.json(compra);
  });

  app.delete("/api/compras-cartao/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const deleted = await storage.deleteCompraCartao(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/servicos", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const servicos = await storage.getServicos(userId);
    res.json(servicos);
  });

  app.post("/api/servicos", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = servicoBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const servico = await storage.createServico({ ...parsed.data, userId });
    res.json(servico);
  });

  app.patch("/api/servicos/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const servico = await storage.updateServico(req.params.id, userId, req.body);
    if (!servico) return res.status(404).json({ message: "Not found" });
    res.json(servico);
  });

  app.delete("/api/servicos/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const deleted = await storage.deleteServico(req.params.id, userId);
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
    const result = await storage.getMetas(userId);
    res.json(result);
  });

  app.post("/api/metas", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const parsed = metaBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const meta = await storage.createMeta({ ...parsed.data, userId });
    res.json(meta);
  });

  app.patch("/api/metas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const meta = await storage.updateMeta(req.params.id, userId, req.body);
    if (!meta) return res.status(404).json({ message: "Not found" });
    res.json(meta);
  });

  app.delete("/api/metas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const deleted = await storage.deleteMeta(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  return httpServer;
}
