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
import { createCloudBackupsController } from "./controllers/cloud-backups.controller.js";
import { createSubscriptionController } from "./controllers/subscription.controller.js";
import { createBillingController } from "./controllers/billing.controller.js";
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
import { BackupJsonParseError, parseBackupJsonImportRequest } from "./validators/backup-import.validators.js";
import { transformBackupForPersistence } from "./services/backup-import-transform.service.js";
import { persistTransformedBackupImport } from "./services/backup-import-persistence.service.js";
import { toErrorLog, writeTechnicalLog } from "./logger.js";
import { CloudBackupsService } from "./services/cloud-backups.service.js";
import { SubscriptionService } from "./services/subscription.service.js";
import { BillingService } from "./services/billing.service.js";
import { requirePremiumFeature } from "./subscription-access.js";
import { divide, parseMoney } from "../utils/money.js";
import { pool } from "./db.js";
import { ENV } from "./env.js";

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

  app.get("/api/imports/logs", requireAuth, requirePremiumFeature("smartImport"), importsController.list);
  app.post("/api/imports/preview", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.preview);
  app.post("/api/imports/confirm", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.confirm);
  app.post("/api/imports/:id/rollback", importRateLimit, requireAuth, requirePremiumFeature("smartImport"), importsController.rollback);
  app.get("/api/subscription/usage", requireAuth, subscriptionController.getUsage);
  app.post("/api/billing/mercadopago/webhook", webhookRateLimit, billingController.processMercadoPagoWebhook);
  app.get("/api/billing/status", requireAuth, billingController.getStatus);
  app.post("/api/billing/trial/start", billingRateLimit, requireAuth, billingController.startTrial);
  app.post("/api/billing/mercadopago/checkout", billingRateLimit, requireAuth, billingController.createMercadoPagoCheckout);
  app.post("/api/billing/mercadopago/cancel", billingRateLimit, requireAuth, billingController.cancelMercadoPagoSubscription);
  app.post("/api/backups/cloud", backupRateLimit, requireAuth, requirePremiumFeature("cloudBackup"), cloudBackupsController.createManual);
  app.get("/api/backups/cloud", requireAuth, requirePremiumFeature("cloudBackup"), cloudBackupsController.listByUser);
  app.get("/api/backups/cloud/:id/download", backupRateLimit, requireAuth, requirePremiumFeature("cloudBackup"), cloudBackupsController.downloadById);
  app.post("/api/backups/cloud/:id/restore", backupRateLimit, requireAuth, requirePremiumFeature("cloudBackup"), cloudBackupsController.restoreById);
  app.post("/api/import", importRateLimit, requireAuth, async (req, res) => {
    const currentUserId = (req.user as { id?: unknown } | undefined)?.id;

    if (typeof currentUserId !== "string" || currentUserId.trim() === "") {
      return res.status(401).json({ message: "Nao autenticado" });
    }

    try {
      const request = parseBackupJsonImportRequest(req.body);
      const transformed = transformBackupForPersistence(request.backup, currentUserId);
      const persisted = await persistTransformedBackupImport(transformed, {
        modo: request.modo,
        userId: currentUserId,
      });

      return res.status(201).json({
        modoImportacao: request.modo,
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
