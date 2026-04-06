import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth } from "./auth";
import { z } from "zod";
import { format } from "date-fns";
import { insertRendaSchema, insertPatrimonioSchema } from "@shared/schema";
import { writeAuditLog, type AuditEvent } from "./audit-log";
import { financialRepository } from "./repositories/financial.repository";
import { DividasService } from "./services/dividas.service";
import { ParcelasService } from "./services/parcelas.service";
import { ComprasCartaoService } from "./services/compras-cartao.service";
import { FinancialService } from "./services/financial.service";
import { createDividasController } from "./controllers/dividas.controller";
import { createParcelasController } from "./controllers/parcelas.controller";
import { createComprasCartaoController } from "./controllers/compras-cartao.controller";
import { createFinancialController } from "./controllers/financial.controller";

const pessoaBody = z.object({
  nome: z.string().min(1),
  tipo: z.enum(["me_deve", "eu_devo"]),
  telefone: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

const nonEmptyUpdateMessage = "Informe ao menos um campo para atualizar";
const moneyField = z.string().or(z.number()).transform(String);

const cartaoBody = z.object({
  nome: z.string().min(1),
  limite: moneyField,
  melhorDiaCompra: z.coerce.number().int().min(1).max(31),
  diaVencimento: z.coerce.number().int().min(1).max(31),
});

const cartaoUpdateBody = z.object({
  nome: z.string().min(1).optional(),
  limite: moneyField.optional(),
  melhorDiaCompra: z.coerce.number().int().min(1).max(31).optional(),
  diaVencimento: z.coerce.number().int().min(1).max(31).optional(),
  iconeId: z.string().optional().nullable(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });


const servicoBody = z.object({
  nome: z.string().min(1),
  categoria: z.string().min(1),
  valorMensal: moneyField,
  dataCobranca: z.coerce.number().int().min(1).max(31),
  formaPagamento: z.string().min(1),
  status: z.string().optional().default("ativo"),
});

const servicoUpdateBody = z.object({
  nome: z.string().min(1).optional(),
  categoria: z.string().min(1).optional(),
  valorMensal: moneyField.optional(),
  dataCobranca: z.coerce.number().int().min(1).max(31).optional(),
  formaPagamento: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  iconeId: z.string().optional().nullable(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

const servicoPessoaBody = z.object({
  servicoId: z.string().min(1),
  pessoaId: z.string().min(1),
  valorDevido: moneyField,
});

const servicoPessoaUpdateBody = z.object({
  servicoId: z.string().min(1).optional(),
  pessoaId: z.string().min(1).optional(),
  valorDevido: moneyField.optional(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

const servicoPagamentoBody = z.object({
  servicoPessoaId: z.string().min(1),
  mes: z.string().min(7).max(7),
  status: z.string().optional().default("pago"),
  dataPagamento: z.string().optional().nullable(),
});

const metaBody = z.object({
  nome: z.string().min(1),
  descricao: z.string().optional().nullable(),
  valorAlvo: moneyField,
  valorAtual: moneyField.optional().default("0"),
  prazo: z.string().min(1),
  status: z.string().optional().default("ativa"),
});

const metaUpdateBody = z.object({
  nome: z.string().min(1).optional(),
  descricao: z.string().optional().nullable(),
  valorAlvo: moneyField.optional(),
  valorAtual: moneyField.optional(),
  prazo: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

const rendaUpdateBody = insertRendaSchema
  .omit({ userId: true })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

const patrimonioUpdateBody = insertPatrimonioSchema
  .omit({ userId: true })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: nonEmptyUpdateMessage });

function auditRoute(
  req: { method: string; path: string },
  event: Omit<AuditEvent, "method" | "route">,
): void {
  writeAuditLog({
    ...event,
    method: req.method,
    route: req.path,
  });
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  setupAuth(app);
  const dividasController = createDividasController(new DividasService(financialRepository));
  const parcelasController = createParcelasController(new ParcelasService(financialRepository));
  const comprasCartaoController = createComprasCartaoController(new ComprasCartaoService(financialRepository));
  const financialController = createFinancialController(new FinancialService(financialRepository));

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
  app.get("/api/dividas", requireAuth, dividasController.list);
  app.get("/api/dividas/pessoa/:pessoaId", requireAuth, dividasController.listByPessoa);
  app.post("/api/dividas", requireAuth, dividasController.create);
  app.post("/api/dividas/parcelado", requireAuth, dividasController.createParcelado);
  app.patch("/api/dividas/:id", requireAuth, dividasController.update);
  app.delete("/api/dividas/:id", requireAuth, dividasController.delete);

  app.get("/api/parcelas", requireAuth, parcelasController.list);
  app.get("/api/parcelas/divida/:dividaId", requireAuth, parcelasController.listByDivida);
  app.patch("/api/parcelas/:id", requireAuth, parcelasController.update);
  app.post("/api/parcelas/antecipar", requireAuth, parcelasController.antecipar);
  app.delete("/api/parcelas/:id", requireAuth, parcelasController.delete);

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
    const parsed = cartaoUpdateBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const c = await storage.updateCartao(req.params.id, userId, parsed.data);
    if (!c) return res.status(404).json({ message: "Not found" });
    res.json(c);
  });
  app.delete("/api/cartoes/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const deleted = await storage.deleteCartao(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/compras-cartao", requireAuth, comprasCartaoController.list);
  app.get("/api/compras-cartao/cartao/:cartaoId", requireAuth, comprasCartaoController.listByCartao);
  app.get("/api/compras-cartao/pessoa/:pessoaId", requireAuth, comprasCartaoController.listByPessoa);
  app.post("/api/compras-cartao", requireAuth, comprasCartaoController.create);
  app.patch("/api/compras-cartao/:id", requireAuth, comprasCartaoController.update);
  app.delete("/api/compras-cartao/:id", requireAuth, comprasCartaoController.delete);

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
    const parsed = servicoUpdateBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const s = await storage.updateServico(req.params.id, userId, parsed.data);
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
    const parsed = servicoPessoaUpdateBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    if (parsed.data.servicoId) {
      const servico = await storage.getServico(parsed.data.servicoId, userId);
      if (!servico) return res.status(400).json({ message: "Servico not found" });
    }
    if (parsed.data.pessoaId) {
      const pessoa = await storage.getPessoa(parsed.data.pessoaId, userId);
      if (!pessoa) return res.status(400).json({ message: "Pessoa not found" });
    }
    const p = await storage.updateServicoPessoa(req.params.id, userId, parsed.data);
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
    const parsed = metaUpdateBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const m = await storage.updateMeta(req.params.id, userId, parsed.data);
    if (!m) return res.status(404).json({ message: "Not found" });
    res.json(m);
  });
  app.delete("/api/metas/:id", requireAuth, async (req, res) => {
    const userId = (req.user as any).id;
    const deleted = await storage.deleteMeta(req.params.id, userId);
    if (!deleted) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.post("/api/dividas/:id/recalcular", requireAuth, dividasController.recalcular);

  app.get("/api/parcelas-compra/:compraId", requireAuth, parcelasController.listCompra);
  app.patch("/api/parcelas-compra/:id", requireAuth, parcelasController.updateCompra);
  app.post("/api/parcelas-compra/bulk", requireAuth, parcelasController.replaceCompraBulk);

  app.get("/api/financial/summary", requireAuth, financialController.summary);
  app.get("/api/financial/score", requireAuth, financialController.score);
  app.get("/api/financial/insights", requireAuth, financialController.insights);

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
    const parsed = rendaUpdateBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const updated = await storage.updateRenda(req.params.id, userId, parsed.data);
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
    const parsed = patrimonioUpdateBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const updated = await storage.updatePatrimonio(req.params.id, userId, parsed.data);
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
    if (!texto) {
      auditRoute(req, {
        action: "import",
        status: "failure",
        domain: "importar_texto",
        userId,
        details: { reason: "missing_text" },
      });
      return res.status(400).json({ message: "Texto obrigatorio" });
    }
    const cartao = await storage.getCartao(cartaoId, userId);
    if (!cartao) {
      auditRoute(req, {
        action: "import",
        status: "failure",
        domain: "importar_texto",
        userId,
        details: { reason: "cartao_not_found", cartaoId },
      });
      return res.status(400).json({ message: "Cartao not found" });
    }
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
    const duplicatas = items.filter((item) => item.duplicata).length;
    auditRoute(req, {
      action: "import",
      status: "success",
      domain: "importar_texto",
      userId,
      details: {
        cartaoId,
        linhasRecebidas: linhas.length,
        itensProcessados: items.length,
        duplicatas,
      },
    });
    res.json(items);
  });

  return httpServer;
}
