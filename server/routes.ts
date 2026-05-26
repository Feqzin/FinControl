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
import { createReportsController } from "./controllers/reports.controller";
import { createCompraAliasesController } from "./controllers/compra-aliases.controller";
import { createIconMatchRulesController } from "./controllers/icon-match-rules.controller";
import { createUserIconLibraryController } from "./controllers/user-icon-library.controller";
import { createOfficialIconsController } from "./controllers/official-icons.controller";
import { registerFinancialDomainRoutes } from "./routes/financial-domain.routes";
import { registerCoreDomainRoutes } from "./routes/core-domain.routes";
import { PagamentosTimelineService } from "./services/pagamentos-timeline.service";
import { CloudBackupsService } from "./services/cloud-backups.service";
import { ReportsService } from "./services/reports.service";
import { CompraAliasesService } from "./services/compra-aliases.service";
import { IconMatchRulesService } from "./services/icon-match-rules.service";
import { UserIconLibraryService } from "./services/user-icon-library.service";
import { OfficialIconLibraryService } from "./services/official-icons.service";
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
  const reportsController = createReportsController(new ReportsService(financialRepository));
  const compraAliasesController = createCompraAliasesController(new CompraAliasesService(storage));
  const iconMatchRulesController = createIconMatchRulesController(new IconMatchRulesService());
  const userIconLibraryController = createUserIconLibraryController(new UserIconLibraryService());
  const officialIconsController = createOfficialIconsController(new OfficialIconLibraryService());

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

  app.get("/api/reports/overview", requireAuth, reportsController.overview);
  app.get("/api/compra-aliases", requireAuth, compraAliasesController.list);
  app.post("/api/compra-aliases", requireAuth, compraAliasesController.create);
  app.delete("/api/compra-aliases/:id", requireAuth, compraAliasesController.remove);
  app.get("/api/icon-match-rules", requireAuth, iconMatchRulesController.list);
  app.post("/api/icon-match-rules", requireAuth, iconMatchRulesController.create);
  app.delete("/api/icon-match-rules/:id", requireAuth, iconMatchRulesController.remove);
  app.get("/api/user-icon-library", requireAuth, userIconLibraryController.list);
  app.post("/api/user-icon-library", requireAuth, userIconLibraryController.create);
  app.post("/api/user-icon-library/batch", requireAuth, userIconLibraryController.createBatch);
  app.patch("/api/user-icon-library/:id", requireAuth, userIconLibraryController.update);
  app.delete("/api/user-icon-library/:id", requireAuth, userIconLibraryController.remove);
  app.get("/api/icons/official", requireAuth, officialIconsController.listOfficial);
  app.get("/api/icons/community", requireAuth, officialIconsController.listCommunity);
  app.get("/api/icons/packs", requireAuth, officialIconsController.listPacks);
  app.get("/api/icons/community/packs", requireAuth, officialIconsController.listCommunityPacks);
  app.get("/api/icons/community/packs/:id", requireAuth, officialIconsController.getCommunityPackDetails);
  app.post("/api/icons/community/publish", requireAuth, officialIconsController.publishCommunityIcon);
  app.post("/api/icons/community/packs", requireAuth, officialIconsController.createCommunityPack);
  app.post("/api/icons/community/:id/add-to-library", requireAuth, officialIconsController.addCommunityIconToLibrary);
  app.post("/api/icons/community/packs/:id/add-to-library", requireAuth, officialIconsController.addCommunityPackToLibrary);
  app.patch("/api/icons/community/packs/:id", requireAuth, officialIconsController.updateCommunityPack);
  app.patch("/api/icons/community/packs/:id/unpublish", requireAuth, officialIconsController.unpublishCommunityPack);
  app.patch("/api/icons/community/:id/unpublish", requireAuth, officialIconsController.unpublishCommunityIcon);
  app.post("/api/icons/official/:id/add-to-library", requireAuth, officialIconsController.addOfficialIconToLibrary);
  app.post("/api/icons/packs/:id/add-to-library", requireAuth, officialIconsController.addOfficialPackToLibrary);
  app.post("/api/admin/icons/packs", requireAuth, officialIconsController.adminCreatePack);
  app.patch("/api/admin/icons/packs/:id", requireAuth, officialIconsController.adminUpdatePack);
  app.post("/api/admin/icons/official", requireAuth, officialIconsController.adminCreateOfficialIcon);
  app.patch("/api/admin/icons/official/:id", requireAuth, officialIconsController.adminUpdateOfficialIcon);

  app.get("/api/pessoas/:pessoaId/timeline-pagamentos", requireAuth, pagamentosTimelineController.listByPessoa);
  app.patch("/api/pagamentos/:sourceType/:sourceId/observacao", requireAuth, pagamentosTimelineController.updateObservacao);
  app.post("/api/pagamentos/:sourceType/:sourceId/comprovante", requireAuth, pagamentosTimelineController.uploadComprovante);
  app.get("/api/pagamentos/:sourceType/:sourceId/comprovante", requireAuth, pagamentosTimelineController.getComprovante);
  app.delete("/api/pagamentos/:sourceType/:sourceId/comprovante", requireAuth, pagamentosTimelineController.deleteComprovante);

  app.get("/api/imports/logs", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.list);
  app.post("/api/imports/preview", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.preview);
  app.post("/api/imports/confirm", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.confirm);
  app.post("/api/imports/reconcile-purchase", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.reconcile);
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
