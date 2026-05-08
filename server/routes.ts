import type { Express, Request } from "express";
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
import { importRateLimit } from "./middleware/rate-limit";

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
  app.delete("/api/pagamentos/:sourceType/:sourceId/comprovante", requireAuth, pagamentosTimelineController.deleteComprovante);

  app.get("/api/imports/logs", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.list);
  app.post("/api/imports/preview", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.preview);
  app.post("/api/imports/confirm", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.confirm);
  app.post("/api/imports/:id/rollback", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.rollback);
  app.post("/api/backups/cloud", requireAuth, requirePremiumFeature("cloudBackup"), cloudBackupsController.createManual);
  app.get("/api/backups/cloud", requireAuth, requirePremiumFeature("cloudBackup"), cloudBackupsController.listByUser);

  app.post(
    "/api/importar-texto",
    importRateLimit,
    requireAuth,
    requirePremiumFeature("smartImport"),
    (req, res) => {
      const userId = (req.user as { id?: unknown } | undefined)?.id;
      auditRoute(req, {
        action: "import",
        status: "failure",
        domain: "importar_texto_legacy",
        userId: typeof userId === "string" ? userId : null,
        details: { reason: "endpoint_deprecated" },
      });
      return res.status(410).json({
        message: "Endpoint legado descontinuado. Use /api/imports/preview e /api/imports/confirm.",
      });
    },
  );

}
