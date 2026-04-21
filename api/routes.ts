import type { Express, Request } from "express";
import { format } from "date-fns";
import { setupAuth, requireAuth } from "./auth.js";
import { writeAuditLog, type AuditEvent } from "./audit-log.js";
import { storage } from "./storage.js";
import { financialRepository } from "./repositories/financial.repository.js";
import { DividasService } from "./services/dividas.service.js";
import { ParcelasService } from "./services/parcelas.service.js";
import { ComprasCartaoService } from "./services/compras-cartao.service.js";
import { CartoesService } from "./services/cartoes.service.js";
import { FinancialService } from "./services/financial.service.js";
import { ImportsService } from "./services/imports.service.js";
import { PessoasService } from "./services/pessoas.service.js";
import { ServicosService } from "./services/servicos.service.js";
import { MetasService } from "./services/metas.service.js";
import { RendasService } from "./services/rendas.service.js";
import { PatrimoniosService } from "./services/patrimonios.service.js";
import { createDividasController } from "./controllers/dividas.controller.js";
import { createParcelasController } from "./controllers/parcelas.controller.js";
import { createCartoesController } from "./controllers/cartoes.controller.js";
import { createComprasCartaoController } from "./controllers/compras-cartao.controller.js";
import { createFinancialController } from "./controllers/financial.controller.js";
import { createImportsController } from "./controllers/imports.controller.js";
import { createPessoasController } from "./controllers/pessoas.controller.js";
import { createServicosController } from "./controllers/servicos.controller.js";
import { createMetasController } from "./controllers/metas.controller.js";
import { createRendasController } from "./controllers/rendas.controller.js";
import { createPatrimoniosController } from "./controllers/patrimonios.controller.js";
import { createPagamentosTimelineController } from "./controllers/pagamentos-timeline.controller.js";
import { registerFinancialDomainRoutes } from "./routes/financial-domain.routes.js";
import { registerCoreDomainRoutes } from "./routes/core-domain.routes.js";
import { PagamentosTimelineService } from "./services/pagamentos-timeline.service.js";
import { divide, parseMoney } from "../utils/money.js";

function auditRoute(
  req: Request,
  event: Omit<AuditEvent, "method" | "route">,
): void {
  writeAuditLog({
    ...event,
    method: req.method,
    route: req.path,
    requestId: req.requestId ?? null,
    requestIp: req.ip ?? null,
    userAgent: req.get("user-agent") ?? null,
  });
}

export function registerRoutes(app: Express): void {
  setupAuth(app);

  const dividasController = createDividasController(new DividasService(financialRepository));
  const parcelasController = createParcelasController(new ParcelasService(financialRepository));
  const cartoesController = createCartoesController(new CartoesService(financialRepository));
  const comprasCartaoController = createComprasCartaoController(new ComprasCartaoService(financialRepository));
  const financialController = createFinancialController(new FinancialService(financialRepository));
  const importsController = createImportsController(new ImportsService());

  const pessoasController = createPessoasController(new PessoasService(storage));
  const servicosController = createServicosController(new ServicosService(storage));
  const metasController = createMetasController(new MetasService(storage));
  const rendasController = createRendasController(new RendasService(storage));
  const patrimoniosController = createPatrimoniosController(new PatrimoniosService(storage));
  const pagamentosTimelineController = createPagamentosTimelineController(new PagamentosTimelineService(financialRepository));

  registerFinancialDomainRoutes(app, {
    dividasController,
    parcelasController,
    cartoesController,
    comprasCartaoController,
    financialController,
  });

  registerCoreDomainRoutes(app, {
    pessoasController,
    servicosController,
    metasController,
    rendasController,
    patrimoniosController,
  });

  app.get("/api/pessoas/:pessoaId/timeline-pagamentos", requireAuth, pagamentosTimelineController.listByPessoa);
  app.patch("/api/pagamentos/:sourceType/:sourceId/observacao", requireAuth, pagamentosTimelineController.updateObservacao);
  app.post("/api/pagamentos/:sourceType/:sourceId/comprovante", requireAuth, pagamentosTimelineController.uploadComprovante);
  app.get("/api/pagamentos/:sourceType/:sourceId/comprovante", requireAuth, pagamentosTimelineController.getComprovante);

  app.get("/api/imports/logs", requireAuth, importsController.list);
  app.post("/api/imports/preview", requireAuth, importsController.preview);
  app.post("/api/imports/confirm", requireAuth, importsController.confirm);
  app.post("/api/imports/:id/rollback", requireAuth, importsController.rollback);

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
      const valor = parseMoney(valorStr);
      if (valor == null || valor <= 0) continue;
      const parcelaMatch = linha.match(/(\d+)\/(\d+)/);
      const parcelaAtual = parcelaMatch ? parseInt(parcelaMatch[1]) : 1;
      const totalParcelas = parcelaMatch ? parseInt(parcelaMatch[2]) : 1;
      const valorParcela = parseMoney(divide(valor, totalParcelas)) ?? 0;
      const dataMatch = linha.match(/(\d{2})\/(\d{2})(?:\/(\d{4}))?/);
      let dataCompra = format(new Date(), "yyyy-MM-dd");
      if (dataMatch) {
        const day = dataMatch[1];
        const month = dataMatch[2];
        const year = dataMatch[3] || String(new Date().getFullYear());
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
      const duplicata = existentes.find((e: { valorParcela: string; descricao: string; cartaoId: string }) => {
        const valorParcelaExistente = parseMoney(e.valorParcela) ?? 0;
        const diffValor = Math.abs(valorParcelaExistente - valorParcela) / (valorParcela || 1);
        const nomeSim = e.descricao.toLowerCase().includes(descricao.toLowerCase().slice(0, 5));
        return diffValor < 0.05 && nomeSim && e.cartaoId === cartaoId;
      });
      items.push({
        descricao,
        valor,
        valorParcela,
        parcelas: totalParcelas,
        parcelaAtual,
        dataCompra,
        duplicata: duplicata || null,
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

}
