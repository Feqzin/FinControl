import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth } from "./auth";
import { z } from "zod";

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
});

const dividaUpdate = z.object({
  status: z.string().optional(),
  dataPagamento: z.string().optional().nullable(),
  formaPagamento: z.string().optional().nullable(),
}).passthrough();

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
    const pessoa = await storage.updatePessoa(req.params.id, userId, req.body);
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
    const deleted = await storage.deleteDivida(req.params.id, userId);
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

  return httpServer;
}
