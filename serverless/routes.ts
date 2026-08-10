import type { Express, Request } from "express";
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
import { createCloudBackupsController } from "./controllers/cloud-backups.controller.js";
import { createSubscriptionController } from "./controllers/subscription.controller.js";
import { createBillingController } from "./controllers/billing.controller.js";
import { createReportsController } from "./controllers/reports.controller.js";
import { createCompraAliasesController } from "./controllers/compra-aliases.controller.js";
import { createIconMatchRulesController } from "./controllers/icon-match-rules.controller.js";
import { createUserIconLibraryController } from "./controllers/user-icon-library.controller.js";
import { createOfficialIconsController } from "./controllers/official-icons.controller.js";
import { createCommunityProfilesController } from "./controllers/community-profiles.controller.js";
import { createFuturePurchaseSimulationsController } from "./controllers/future-purchase-simulations.controller.js";
import { createVacationPlansController } from "./controllers/vacation-plans.controller.js";
import { createCnpjDasController } from "./controllers/cnpj-das.controller.js";
import { registerFinancialDomainRoutes } from "./routes/financial-domain.routes.js";
import { registerCoreDomainRoutes } from "./routes/core-domain.routes.js";
import { registerDebugDbPingRoute } from "./routes/debug-db-ping.route.js";
import { guardDebugRouteAccess, sendDebugUnavailable } from "./routes/debug-route-guard.js";
import {
  backupRateLimit,
  billingRateLimit,
  importRateLimit,
  uploadRateLimit,
  webhookRateLimit,
} from "./middleware/rate-limit.js";
import { PagamentosTimelineService } from "./services/pagamentos-timeline.service.js";
import {
  BackupJsonParseError,
  parseBackupJsonImportEnvelope,
  parseBackupJsonImportRequest,
} from "./validators/backup-import.validators.js";
import { transformBackupForPersistence } from "./services/backup-import-transform.service.js";
import { persistTransformedBackupImport } from "./services/backup-import-persistence.service.js";
import { buildBackupRestorePreview, buildBackupRestoreSelectionPlan } from "./services/backup-restore-selection.service.js";
import { toErrorLog, writeTechnicalLog } from "./logger.js";
import { CloudBackupsService } from "./services/cloud-backups.service.js";
import { SubscriptionService } from "./services/subscription.service.js";
import { BillingService } from "./services/billing.service.js";
import { requirePremiumFeature } from "./subscription-access.js";
import { pool } from "./db.js";
import { ENV } from "./env.js";
import { ReportsService } from "./services/reports.service.js";
import { CompraAliasesService } from "./services/compra-aliases.service.js";
import { IconMatchRulesService } from "./services/icon-match-rules.service.js";
import { UserIconLibraryService } from "./services/user-icon-library.service.js";
import { OfficialIconLibraryService } from "./services/official-icons.service.js";
import { CommunityProfilesService } from "./services/community-profiles.service.js";
import { FuturePurchaseSimulationsService } from "./services/future-purchase-simulations.service.js";
import { VacationPlansService } from "./services/vacation-plans.service.js";
import { CnpjDasService } from "./services/cnpj-das.service.js";
import { db } from "./db.js";

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

function isBackupValidationError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();

  return (
    message.startsWith("registro invalido") ||
    message.startsWith("campo obrigatorio invalido") ||
    message.startsWith("campo invalido") ||
    message.startsWith("relacionamento invalido")
  );
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
  const subscriptionController = createSubscriptionController(new SubscriptionService(storage));
  const billingController = createBillingController(new BillingService());
  const reportsController = createReportsController(new ReportsService(financialRepository));
  const compraAliasesController = createCompraAliasesController(new CompraAliasesService(storage));
  const iconMatchRulesController = createIconMatchRulesController(new IconMatchRulesService());
  const userIconLibraryController = createUserIconLibraryController(new UserIconLibraryService());
  const officialIconsController = createOfficialIconsController(new OfficialIconLibraryService());
  const communityProfilesController = createCommunityProfilesController(new CommunityProfilesService());
  const futurePurchaseSimulationsController = createFuturePurchaseSimulationsController(new FuturePurchaseSimulationsService(storage));
  const vacationPlansController = createVacationPlansController(new VacationPlansService(storage));
  const cnpjDasController = createCnpjDasController(new CnpjDasService(db));

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
  app.get("/api/simulador/compra-futura/simulacoes", requireAuth, futurePurchaseSimulationsController.list);
  app.post("/api/simulador/compra-futura/simulacoes", requireAuth, futurePurchaseSimulationsController.create);
  app.get("/api/simulador/compra-futura/simulacoes/:id", requireAuth, futurePurchaseSimulationsController.get);
  app.patch("/api/simulador/compra-futura/simulacoes/:id", requireAuth, futurePurchaseSimulationsController.update);
  app.delete("/api/simulador/compra-futura/simulacoes/:id", requireAuth, futurePurchaseSimulationsController.remove);
  app.get("/api/vacation-plans", requireAuth, vacationPlansController.list);
  app.post("/api/vacation-plans/batch", requireAuth, vacationPlansController.createBatch);
  app.post("/api/vacation-plans", requireAuth, vacationPlansController.create);
  app.delete("/api/vacation-plans/:id", requireAuth, vacationPlansController.remove);
  app.get("/api/cnpj-das", requireAuth, cnpjDasController.list);
  app.post("/api/cnpj-das/preview", requireAuth, cnpjDasController.preview);
  app.post("/api/cnpj-das", requireAuth, cnpjDasController.save);
  app.post("/api/cnpj-das/:id/recalculate", requireAuth, cnpjDasController.recalculate);

  registerDebugDbPingRoute(app);

  // Rota temporaria de diagnostico de banco/schema em runtime.
  // Remover apos conclusao da investigacao de ambiente em producao.
  app.get("/api/debug/db-check", async (req, res) => {
    const debugAccess = guardDebugRouteAccess(req, res, "db-check");
    if (!debugAccess.allowed) {
      return;
    }

    let hostSanitized: string | null = null;
    try {
      const parsed = new URL(ENV.databaseUrl);
      hostSanitized = parsed.hostname || null;
    } catch {
      hostSanitized = null;
    }

    try {
      if (debugAccess.isProduction) {
        await pool.query("select 1 as ok");
        return res.json({
          ok: true,
          status: "ok",
        });
      }

      const result = await pool.query<{
        currentDatabase: string;
        currentSchema: string;
        currentUser: string;
        usersTableExists: boolean;
        userFernandoExists: boolean;
        usersCount: number;
      }>(`
        SELECT
          current_database() AS "currentDatabase",
          current_schema() AS "currentSchema",
          current_user AS "currentUser",
          (to_regclass(format('%I.users', current_schema())) IS NOT NULL) AS "usersTableExists",
          CASE
            WHEN to_regclass(format('%I.users', current_schema())) IS NOT NULL
              THEN EXISTS (SELECT 1 FROM users WHERE username = 'fernandoq87@gmail.com')
            ELSE FALSE
          END AS "userFernandoExists",
          CASE
            WHEN to_regclass(format('%I.users', current_schema())) IS NOT NULL
              THEN (SELECT count(*)::int FROM users)
            ELSE 0
          END AS "usersCount"
      `);

      const row = result.rows[0];

      return res.json({
        ok: true,
        hostSanitized,
        currentDatabase: row?.currentDatabase ?? null,
        currentSchema: row?.currentSchema ?? null,
        currentUser: row?.currentUser ?? null,
        usersTableExists: row?.usersTableExists ?? false,
        userFernandoExists: row?.userFernandoExists ?? false,
        usersCount: row?.usersCount ?? 0,
      });
    } catch (error) {
      if (debugAccess.isProduction) {
        sendDebugUnavailable(res);
        return;
      }

      return res.status(500).json({
        ok: false,
        hostSanitized,
        message: error instanceof Error ? error.message : "Erro interno ao diagnosticar banco",
      });
    }
  });

  // Rota temporaria de diagnostico de conectividade Postgres em runtime.
  // Remover apos conclusao da investigacao de timeout em producao.
  app.get("/api/debug/db-connectivity", async (req, res) => {
    const debugAccess = guardDebugRouteAccess(req, res, "db-connectivity");
    if (!debugAccess.allowed) {
      return;
    }

    let hostSanitized: string | null = null;
    try {
      const parsed = new URL(ENV.databaseUrl);
      hostSanitized = parsed.hostname || null;
    } catch {
      hostSanitized = null;
    }

    let connectAttemptMs: number | null = null;
    let select1Ms: number | null = null;

    try {
      const connectStartedAt = Date.now();
      const client = await pool.connect();
      connectAttemptMs = Date.now() - connectStartedAt;

      try {
        const selectStartedAt = Date.now();
        const result = await client.query<{
          currentDatabase: string;
          currentSchema: string;
          currentUser: string;
        }>(
          debugAccess.isProduction
            ? "select 1 as ok"
            : `
          SELECT
            current_database() AS "currentDatabase",
            current_schema() AS "currentSchema",
            current_user AS "currentUser",
            1 AS "ok"
        `,
        );
        select1Ms = Date.now() - selectStartedAt;

        const row = result.rows[0];
        if (debugAccess.isProduction) {
          return res.json({
            ok: true,
            status: "ok",
            connectAttemptMs,
            select1Ms,
          });
        }

        return res.json({
          ok: true,
          hostSanitized,
          connectAttemptMs,
          select1Ms,
          currentDatabase: row?.currentDatabase ?? null,
          currentSchema: row?.currentSchema ?? null,
          currentUser: row?.currentUser ?? null,
          errorMessage: null,
        });
      } finally {
        client.release();
      }
    } catch (error) {
      if (debugAccess.isProduction) {
        sendDebugUnavailable(res);
        return;
      }

      return res.status(500).json({
        ok: false,
        hostSanitized,
        connectAttemptMs,
        select1Ms,
        currentDatabase: null,
        currentSchema: null,
        currentUser: null,
        errorMessage: error instanceof Error ? error.message : "Erro interno ao testar conectividade",
      });
    }
  });

  app.get("/api/pessoas/:pessoaId/timeline-pagamentos", requireAuth, pagamentosTimelineController.listByPessoa);
  app.patch("/api/pagamentos/:sourceType/:sourceId/observacao", requireAuth, pagamentosTimelineController.updateObservacao);
  app.post("/api/pagamentos/:sourceType/:sourceId/comprovante", uploadRateLimit, requireAuth, pagamentosTimelineController.uploadComprovante);
  app.get("/api/pagamentos/:sourceType/:sourceId/comprovante", requireAuth, pagamentosTimelineController.getComprovante);
  app.delete("/api/pagamentos/:sourceType/:sourceId/comprovante", requireAuth, pagamentosTimelineController.deleteComprovante);

  app.get("/api/imports/logs", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.list);
  app.post("/api/imports/preview", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.preview);
  app.post("/api/imports/confirm", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.confirm);
  app.post("/api/imports/reconcile-purchase", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.reconcile);
  app.post("/api/imports/:id/rollback", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.rollback);
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
  app.get("/api/community/profile", requireAuth, communityProfilesController.getOwnProfile);
  app.patch("/api/community/profile", requireAuth, communityProfilesController.updateOwnProfile);
  app.get("/api/community/creators/:publicCode", requireAuth, communityProfilesController.getCreatorProfile);
  app.get("/api/icons/official", requireAuth, officialIconsController.listOfficial);
  app.get("/api/icons/community", requireAuth, officialIconsController.listCommunity);
  app.get("/api/icons/packs", requireAuth, officialIconsController.listPacks);
  app.get("/api/icons/community/packs", requireAuth, officialIconsController.listCommunityPacks);
  app.get("/api/icons/community/packs/:id", requireAuth, officialIconsController.getCommunityPackDetails);
  app.post("/api/icons/community/publish", requireAuth, officialIconsController.publishCommunityIcon);
  app.post("/api/icons/community/packs", requireAuth, officialIconsController.createCommunityPack);
  app.post("/api/icons/community/:id/add-to-library", requireAuth, officialIconsController.addCommunityIconToLibrary);
  app.post("/api/icons/community/pack-items/:itemPublicCode/add-to-library", requireAuth, officialIconsController.addCommunityPackItemToLibrary);
  app.post("/api/icons/community/packs/:id/add-to-library", requireAuth, officialIconsController.addCommunityPackToLibrary);
  app.patch("/api/icons/community/packs/:id", requireAuth, officialIconsController.updateCommunityPack);
    app.patch("/api/icons/community/packs/:id/unpublish", requireAuth, officialIconsController.unpublishCommunityPack);
    app.patch("/api/icons/community/:id/unpublish", requireAuth, officialIconsController.unpublishCommunityIcon);
    app.post("/api/icons/official/:id/add-to-library", requireAuth, officialIconsController.addOfficialIconToLibrary);
    app.post("/api/icons/packs/:id/rating", requireAuth, officialIconsController.rateOfficialPack);
    app.post("/api/icons/packs/:id/add-to-library", requireAuth, officialIconsController.addOfficialPackToLibrary);
  app.post("/api/admin/icons/packs", requireAuth, officialIconsController.adminCreatePack);
  app.patch("/api/admin/icons/packs/:id", requireAuth, officialIconsController.adminUpdatePack);
  app.post("/api/admin/icons/official", requireAuth, officialIconsController.adminCreateOfficialIcon);
  app.patch("/api/admin/icons/official/:id", requireAuth, officialIconsController.adminUpdateOfficialIcon);
  app.get("/api/subscription/usage", requireAuth, subscriptionController.getUsage);
  app.post("/api/billing/mercadopago/webhook", webhookRateLimit, billingController.processMercadoPagoWebhook);
  app.get("/api/billing/status", requireAuth, billingController.getStatus);
  app.post("/api/billing/trial/start", billingRateLimit, requireAuth, billingController.startTrial);
  app.post("/api/billing/mercadopago/checkout", billingRateLimit, requireAuth, billingController.createMercadoPagoCheckout);
  app.post("/api/billing/mercadopago/cancel", billingRateLimit, requireAuth, billingController.cancelMercadoPagoSubscription);
  app.post("/api/backups/cloud", backupRateLimit, requireAuth, requirePremiumFeature("cloudBackup"), cloudBackupsController.createManual);
  app.get("/api/backups/cloud", requireAuth, requirePremiumFeature("cloudBackup"), cloudBackupsController.listByUser);
  app.get("/api/backups/cloud/:id/download", backupRateLimit, requireAuth, requirePremiumFeature("cloudBackup"), cloudBackupsController.downloadById);
  app.post("/api/backups/cloud/:id/preview", backupRateLimit, requireAuth, requirePremiumFeature("cloudBackup"), cloudBackupsController.previewById);
  app.post("/api/backups/cloud/:id/delete", backupRateLimit, requireAuth, requirePremiumFeature("cloudBackup"), cloudBackupsController.deleteById);
  app.post("/api/backups/cloud/:id/restore", backupRateLimit, requireAuth, requirePremiumFeature("cloudBackup"), cloudBackupsController.restoreById);
  app.post("/api/import/preview", importRateLimit, requireAuth, async (req, res) => {
    const currentUserId = (req.user as { id?: unknown } | undefined)?.id;

    if (typeof currentUserId !== "string" || currentUserId.trim() === "") {
      return res.status(401).json({ message: "Nao autenticado" });
    }

    try {
      const envelope = parseBackupJsonImportEnvelope(req.body);
      const preview = buildBackupRestorePreview({
        envelope,
      });

      writeTechnicalLog({
        event: "backup.restore.preview",
        source: "routes",
        level: "info",
        requestId: req.requestId,
        data: {
          userId: currentUserId,
          origin: "local_import_preview",
          modules: preview.modules.map((module) => ({
            key: module.key,
            count: module.count,
            foundInBackup: module.foundInBackup,
          })),
        },
      });

      return res.status(200).json(preview);
    } catch (error) {
      if (error instanceof BackupJsonParseError) {
        return res.status(400).json({ message: error.message, details: error.details ?? [] });
      }

      if (isBackupValidationError(error)) {
        return res.status(400).json({ message: error.message });
      }

      writeTechnicalLog({
        event: "backup.import.preview.failed",
        source: "routes",
        level: "error",
        requestId: req.requestId,
        data: {
          userId: currentUserId,
          error: toErrorLog(error),
        },
      });

      return res.status(500).json({
        message: "Falha ao analisar backup. Tente novamente em alguns instantes.",
      });
    }
  });
  app.post("/api/import", importRateLimit, requireAuth, async (req, res) => {
    const currentUserId = (req.user as { id?: unknown } | undefined)?.id;

    if (typeof currentUserId !== "string" || currentUserId.trim() === "") {
      return res.status(401).json({ message: "Nao autenticado" });
    }

    try {
      const request = parseBackupJsonImportRequest(req.body);
      const envelope = parseBackupJsonImportEnvelope(req.body);
      const plan = buildBackupRestoreSelectionPlan({
        mode: request.modo,
        modules: request.modules,
        envelope,
      });
      if (plan.errors.length > 0) {
        return res.status(400).json({ message: plan.errors[0] });
      }

      const transformed = transformBackupForPersistence(envelope.backup, currentUserId);
      const persisted = await persistTransformedBackupImport(transformed, {
        modo: request.modo,
        moduleActions: plan.effectiveActions,
        userId: currentUserId,
      });

      writeTechnicalLog({
        event: "backup.restore.applied",
        source: "routes",
        level: "info",
        requestId: req.requestId,
        data: {
          userId: currentUserId,
          origin: "local_import",
          mode: request.modo,
          modules: plan.effectiveActions,
          warnings: plan.warnings,
          counts: {
            pessoas: persisted.pessoasInseridas,
            cartoes: persisted.cartoesInseridos,
            dividas: persisted.dividasInseridas,
            compras: persisted.comprasInseridas,
            parcelasCompra: persisted.parcelasCompraInseridas,
            servicos: persisted.servicosInseridos,
            servicoPessoas: persisted.servicoPessoasInseridas,
            servicoPagamentos: persisted.servicoPagamentosInseridos,
            pessoaSaldoMovimentacoes: persisted.saldoMovimentacoesInseridas,
            metas: persisted.metasInseridas,
          },
        },
      });

      return res.status(201).json({
        modoImportacao: request.modo,
        modulosAplicados: plan.effectiveActions,
        avisos: plan.warnings,
        pessoasImportadas: persisted.pessoasInseridas,
        cartoesImportados: persisted.cartoesInseridos,
        dividasImportadas: persisted.dividasInseridas,
        comprasImportadas: persisted.comprasInseridas,
        servicosImportados: persisted.servicosInseridos,
        servicoPessoasImportados: persisted.servicoPessoasInseridas,
        servicoPagamentosImportados: persisted.servicoPagamentosInseridos,
        saldoMovimentacoesImportadas: persisted.saldoMovimentacoesInseridas,
        metasImportadas: persisted.metasInseridas,
      });
    } catch (error) {
      if (error instanceof BackupJsonParseError) {
        return res.status(400).json({ message: error.message, details: error.details ?? [] });
      }

      if (isBackupValidationError(error)) {
        return res.status(400).json({ message: error.message });
      }

      writeTechnicalLog({
        event: "backup.import.failed",
        source: "routes",
        level: "error",
        requestId: req.requestId,
        data: {
          userId: currentUserId,
          error: toErrorLog(error),
        },
      });

      return res.status(500).json({
        message: "Falha ao importar backup. Tente novamente em alguns instantes.",
      });
    }
  });

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
