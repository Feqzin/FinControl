import type { Express, Request } from "express";
import { format } from "date-fns";
import { setupAuth, requireAuth } from "./auth";
import { writeAuditLog, type AuditEvent } from "./audit-log";
import { storage } from "./storage";
import { financialRepository } from "./repositories/financial.repository";
import { DividasService } from "./services/dividas.service";
import { ParcelasService } from "./services/parcelas.service";
import { ComprasCartaoService } from "./services/compras-cartao.service";
import { CartoesService } from "./services/cartoes.service";
import { FinancialService } from "./services/financial.service";
import { ImportsService } from "./services/imports.service";
import { PessoasService } from "./services/pessoas.service";
import { ServicosService } from "./services/servicos.service";
import { MetasService } from "./services/metas.service";
import { RendasService } from "./services/rendas.service";
import { PatrimoniosService } from "./services/patrimonios.service";
import { createDividasController } from "./controllers/dividas.controller";
import { createParcelasController } from "./controllers/parcelas.controller";
import { createCartoesController } from "./controllers/cartoes.controller";
import { createComprasCartaoController } from "./controllers/compras-cartao.controller";
import { createFinancialController } from "./controllers/financial.controller";
import { createImportsController } from "./controllers/imports.controller";
import { createPessoasController } from "./controllers/pessoas.controller";
import { createServicosController } from "./controllers/servicos.controller";
import { createMetasController } from "./controllers/metas.controller";
import { createRendasController } from "./controllers/rendas.controller";
import { createPatrimoniosController } from "./controllers/patrimonios.controller";
import { createPagamentosTimelineController } from "./controllers/pagamentos-timeline.controller";
import { createCloudBackupsController } from "./controllers/cloud-backups.controller";
import { registerFinancialDomainRoutes } from "./routes/financial-domain.routes";
import { registerCoreDomainRoutes } from "./routes/core-domain.routes";
import { PagamentosTimelineService } from "./services/pagamentos-timeline.service";
import { CloudBackupsService } from "./services/cloud-backups.service";
import { requirePremiumFeature } from "./subscription-access";
import { divide, parseMoney } from "../utils/money";

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
  const cloudBackupsController = createCloudBackupsController(new CloudBackupsService());

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
  app.post("/api/backups/cloud", requireAuth, requirePremiumFeature("cloudBackup"), cloudBackupsController.createManual);
  app.get("/api/backups/cloud", requireAuth, requirePremiumFeature("cloudBackup"), cloudBackupsController.listByUser);

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
