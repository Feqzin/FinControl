import type { Request, Response } from "express";
import { formatMoneyFixed } from "../../utils/money";
import { CartoesService } from "../services/cartoes.service";
import {
  cartaoBody,
  cartaoFaturaPagamentoBody,
  cartaoUpdateBody,
} from "../validators/financial.validators";
import {
  auditRequest,
  getParam,
  getUserId,
  sendBadRequest,
  sendNotFound,
} from "./controller-utils";

const MES_REGEX = /^\d{4}-\d{2}$/;

function parseDryRun(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function parseMes(mes: string): string | null {
  const value = mes.trim();
  return MES_REGEX.test(value) ? value : null;
}

export function createCartoesController(service: CartoesService) {
  return {
    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.list(userId));
    },

    listInvoicePayments: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.listInvoicePayments(userId));
    },

    create: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = cartaoBody.safeParse(req.body);
      if (!parsed.success) {
        auditRequest(req, {
          action: "create",
          status: "failure",
          domain: "cartoes",
          userId,
          details: { reason: "validation_error" },
        });
        return sendBadRequest(res, parsed.error.message);
      }

      const created = await service.create(userId, parsed.data);
      auditRequest(req, {
        action: "create",
        status: "success",
        domain: "cartoes",
        userId,
        targetId: created.id,
        details: {
          nome: created.nome,
          limite: formatMoneyFixed(created.limite),
          melhorDiaCompra: created.melhorDiaCompra,
          diaVencimento: created.diaVencimento,
        },
      });
      return res.json(created);
    },

    update: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const cartaoId = getParam(req, "id");
      const parsed = cartaoUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "cartoes",
          userId,
          targetId: cartaoId,
          details: { reason: "validation_error" },
        });
        return sendBadRequest(res, parsed.error.message);
      }

      const updated = await service.update(cartaoId, userId, parsed.data);
      if (!updated) {
        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "cartoes",
          userId,
          targetId: cartaoId,
          details: { reason: "not_found" },
        });
        return sendNotFound(res);
      }

      auditRequest(req, {
        action: "update",
        status: "success",
        domain: "cartoes",
        userId,
        targetId: updated.id,
        details: {
          nome: updated.nome,
          limite: formatMoneyFixed(updated.limite),
          melhorDiaCompra: updated.melhorDiaCompra,
          diaVencimento: updated.diaVencimento,
        },
      });
      return res.json(updated);
    },

    delete: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const cartaoId = getParam(req, "id");
      const deleted = await service.delete(cartaoId, userId);
      if (!deleted) {
        auditRequest(req, {
          action: "delete",
          status: "failure",
          domain: "cartoes",
          userId,
          targetId: cartaoId,
          details: { reason: "not_found" },
        });
        return sendNotFound(res);
      }

      auditRequest(req, {
        action: "delete",
        status: "success",
        domain: "cartoes",
        userId,
        targetId: cartaoId,
      });
      return res.json({ success: true });
    },

    registerInvoicePayment: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const cartaoId = getParam(req, "cartaoId");
      const mes = parseMes(getParam(req, "mes"));
      const parsed = cartaoFaturaPagamentoBody.safeParse(req.body);

      if (!mes) {
        return sendBadRequest(res, "Mes invalido. Use o formato YYYY-MM.");
      }

      if (!parsed.success) {
        auditRequest(req, {
          action: "create",
          status: "failure",
          domain: "cartoes",
          userId,
          targetId: cartaoId,
          details: { reason: "validation_error", mes },
        });
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.registerInvoicePayment(userId, cartaoId, mes, parsed.data);
      if ("error" in result) {
        const message = result.message
          ?? (
            result.error === "CARTAO_NOT_FOUND"
              ? "Cartao not found"
              : result.error === "FATURA_JA_QUITADA"
                ? "A fatura informada ja esta quitada."
                : result.error === "VALOR_INVALIDO"
                  ? "Informe um valor valido para registrar o pagamento."
                  : result.error === "ALOCACAO_INVALIDA"
                    ? "Nao foi possivel distribuir o pagamento entre as parcelas selecionadas."
                  : "Nenhuma cobranca encontrada para esta fatura."
          );
        auditRequest(req, {
          action: "create",
          status: "failure",
          domain: "cartoes",
          userId,
          targetId: cartaoId,
          details: { reason: result.error.toLowerCase(), mes, valorPago: parsed.data.valorPago },
        });
        if (result.error === "CARTAO_NOT_FOUND") {
          return sendNotFound(res, message);
        }
        return sendBadRequest(res, message);
      }

      auditRequest(req, {
        action: "create",
        status: "success",
        domain: "cartoes",
        userId,
        targetId: cartaoId,
        details: {
          mes,
          valorSolicitado: result.valorSolicitado,
          valorAplicado: result.valorAplicado,
          saldoAnterior: result.saldoAnterior,
          saldoRestante: result.saldoRestante,
          statusFatura: result.statusFatura,
        },
      });
      return res.json(result);
    },

    deleteFaturaByCartaoMonth: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const cartaoId = getParam(req, "cartaoId");
      const mes = parseMes(getParam(req, "mes"));
      const dryRun = parseDryRun(req.query.dryRun);

      if (!mes) {
        return sendBadRequest(res, "Mes invalido. Use o formato YYYY-MM.");
      }

      const result = await service.deleteFaturaDoCartao(userId, { cartaoId, mes, dryRun });
      if ("error" in result) {
        auditRequest(req, {
          action: "delete",
          status: "failure",
          domain: "cartoes",
          userId,
          targetId: cartaoId,
          details: { reason: "cartao_not_found", mes, dryRun },
        });
        return sendNotFound(res, "Cartao not found");
      }
      if (!("impact" in result)) {
        return sendBadRequest(res, "Nao foi possivel calcular o impacto da exclusao.");
      }
      const impact = result.impact;
      if (!impact) {
        return sendBadRequest(res, "Nao foi possivel calcular o impacto da exclusao.");
      }

      auditRequest(req, {
        action: "delete",
        status: "success",
        domain: "cartoes",
        userId,
        targetId: cartaoId,
        details: {
          mes,
          dryRun: result.dryRun,
          comprasRemovidas: impact.comprasRemovidas,
          parcelasRemovidas: impact.parcelasRemovidas,
          valorTotalRemovido: impact.valorTotalRemovido,
        },
      });
      return res.json(result);
    },

    deleteFaturasByMonth: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const mes = parseMes(getParam(req, "mes"));
      const dryRun = parseDryRun(req.query.dryRun);

      if (!mes) {
        return sendBadRequest(res, "Mes invalido. Use o formato YYYY-MM.");
      }

      const result = await service.deleteFaturaDoCartao(userId, { mes, dryRun });
      if (!("impact" in result)) {
        return sendBadRequest(res, "Nao foi possivel calcular o impacto da exclusao.");
      }
      const impact = result.impact;
      if (!impact) {
        return sendBadRequest(res, "Nao foi possivel calcular o impacto da exclusao.");
      }
      auditRequest(req, {
        action: "delete",
        status: "success",
        domain: "cartoes",
        userId,
        details: {
          mes,
          dryRun: result.dryRun,
          comprasRemovidas: impact.comprasRemovidas,
          parcelasRemovidas: impact.parcelasRemovidas,
          valorTotalRemovido: impact.valorTotalRemovido,
          cartoesAfetados: impact.cartoesAfetados.length,
        },
      });

      return res.json(result);
    },
  };
}
