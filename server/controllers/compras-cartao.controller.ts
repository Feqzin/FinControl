import type { Request, Response } from "express";
import { formatMoneyFixed } from "../../utils/money";
import { normalizeIsoDate } from "../../utils/date";
import { ComprasCartaoService, type DeleteCompraScope } from "../services/compras-cartao.service";
import { compraBody, compraUpdateBody } from "../validators/financial.validators";
import { auditRequest, getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils";

function parseDeleteScope(value: unknown): DeleteCompraScope {
  if (typeof value === "string" && value.trim().toLowerCase() === "single_parcela") {
    return "single_parcela";
  }
  return "all_parcelas";
}

function parseDryRun(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function isRemoteIconReference(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^data:/i.test(trimmed) || /^https?:\/\//i.test(trimmed);
}

export function createComprasCartaoController(service: ComprasCartaoService) {
  return {
    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      res.json(await service.list(userId));
    },

    listByCartao: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const cartaoId = getParam(req, "cartaoId");
      res.json(await service.listByCartao(cartaoId, userId));
    },

    listByPessoa: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const pessoaId = getParam(req, "pessoaId");
      res.json(await service.listByPessoa(pessoaId, userId));
    },

    create: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = compraBody.safeParse(req.body);
      if (!parsed.success) {
        auditRequest(req, {
          action: "create",
          status: "failure",
          domain: "compras_cartao",
          userId,
          details: { reason: "validation_error" },
        });
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.create(userId, parsed.data);
      if ("error" in result) {
        if (result.error === "ICONE_NOT_FOUND") {
          const iconErrorCode = isRemoteIconReference(parsed.data.iconeId)
            ? "ICON_REFERENCE_INVALID"
            : "ICON_OWNERSHIP_INVALID";
          auditRequest(req, {
            action: "create",
            status: "failure",
            domain: "compras_cartao",
            userId,
            details: { reason: "icone_not_found_or_not_owned", errorCode: iconErrorCode },
          });
          if (iconErrorCode === "ICON_REFERENCE_INVALID") {
            return res.status(400).json({
              message: "Ícone selecionado não possui referência persistível válida na sua biblioteca.",
              errorCode: iconErrorCode,
            });
          }
          return sendBadRequest(res, "Icone selecionado nao pertence a sua biblioteca.");
        }

        if (result.error === "PESSOA_NOT_FOUND") {
          auditRequest(req, {
            action: "create",
            status: "failure",
            domain: "compras_cartao",
            userId,
            details: { reason: "pessoa_not_found", pessoaId: parsed.data.pessoaId },
          });
          return sendBadRequest(res, "Pessoa not found");
        }

        if (result.error === "REEMBOLSO_INVALIDO") {
          const errorMessage = "message" in result && typeof result.message === "string"
            ? result.message
            : "Dados de reembolso invalidos";
          auditRequest(req, {
            action: "create",
            status: "failure",
            domain: "compras_cartao",
            userId,
            details: { reason: "reembolso_invalido" },
          });
          return sendBadRequest(res, errorMessage);
        }

        auditRequest(req, {
          action: "create",
          status: "failure",
          domain: "compras_cartao",
          userId,
          details: { reason: "cartao_not_found", cartaoId: parsed.data.cartaoId },
        });
        return sendBadRequest(res, "Cartao not found");
      }

      const { created } = result;
      auditRequest(req, {
        action: "create",
        status: "success",
        domain: "compras_cartao",
        userId,
        targetId: created.id,
        details: {
          cartaoId: created.cartaoId,
          parcelas: created.parcelas,
          valorTotal: formatMoneyFixed(created.valorTotal),
          valorParcela: formatMoneyFixed(created.valorParcela),
          dataCompra: normalizeIsoDate(created.dataCompra),
        },
      });
      return res.json(created);
    },

    update: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const compraId = getParam(req, "id");
      const parsed = compraUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "compras_cartao",
          userId,
          targetId: compraId,
          details: { reason: "validation_error" },
        });
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.update(compraId, userId, parsed.data);
      if ("error" in result) {
        if (result.error === "ICONE_NOT_FOUND") {
          const iconErrorCode = isRemoteIconReference(parsed.data.iconeId)
            ? "ICON_REFERENCE_INVALID"
            : "ICON_OWNERSHIP_INVALID";
          auditRequest(req, {
            action: "update",
            status: "failure",
            domain: "compras_cartao",
            userId,
            targetId: compraId,
            details: { reason: "icone_not_found_or_not_owned", errorCode: iconErrorCode },
          });
          if (iconErrorCode === "ICON_REFERENCE_INVALID") {
            return res.status(400).json({
              message: "Ícone selecionado não possui referência persistível válida na sua biblioteca.",
              errorCode: iconErrorCode,
            });
          }
          return sendBadRequest(res, "Icone selecionado nao pertence a sua biblioteca.");
        }

        if (result.error === "CARTAO_NOT_FOUND") {
          auditRequest(req, {
            action: "update",
            status: "failure",
            domain: "compras_cartao",
            userId,
            targetId: compraId,
            details: { reason: "cartao_not_found", cartaoId: parsed.data.cartaoId },
          });
          return sendBadRequest(res, "Cartao not found");
        }

        if (result.error === "PESSOA_NOT_FOUND") {
          auditRequest(req, {
            action: "update",
            status: "failure",
            domain: "compras_cartao",
            userId,
            targetId: compraId,
            details: { reason: "pessoa_not_found", pessoaId: parsed.data.pessoaId },
          });
          return sendBadRequest(res, "Pessoa not found");
        }

        if (result.error === "REEMBOLSO_INVALIDO") {
          const errorMessage = "message" in result && typeof result.message === "string"
            ? result.message
            : "Dados de reembolso invalidos";
          auditRequest(req, {
            action: "update",
            status: "failure",
            domain: "compras_cartao",
            userId,
            targetId: compraId,
            details: { reason: "reembolso_invalido" },
          });
          return sendBadRequest(res, errorMessage);
        }

        if (result.error === "ICONE_UPDATE_ERROR") {
          const errorMessage = "message" in result && typeof result.message === "string"
            ? result.message
            : "Não foi possível salvar o ícone da compra.";
          const errorCode = "reason" in result && typeof result.reason === "string"
            ? result.reason
            : "ICON_PERSISTENCE_FAILED";
          auditRequest(req, {
            action: "update",
            status: "failure",
            domain: "compras_cartao",
            userId,
            targetId: compraId,
            details: { reason: "icone_update_error", errorCode },
          });
          return res.status(500).json({ message: errorMessage, errorCode });
        }

        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "compras_cartao",
          userId,
          targetId: compraId,
          details: { reason: "not_found" },
        });
        return sendNotFound(res);
      }

      const { updated } = result;
      auditRequest(req, {
        action: "update",
        status: "success",
        domain: "compras_cartao",
        userId,
        targetId: updated.id,
        details: {
          parcelas: updated.parcelas,
          valorTotal: formatMoneyFixed(updated.valorTotal),
          valorParcela: formatMoneyFixed(updated.valorParcela),
          dataCompra: normalizeIsoDate(updated.dataCompra),
        },
      });
      return res.json(updated);
    },

    delete: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const compraId = getParam(req, "id");
      const deleted = await service.delete(compraId, userId);
      if (!deleted) {
        auditRequest(req, {
          action: "delete",
          status: "failure",
          domain: "compras_cartao",
          userId,
          targetId: compraId,
          details: { reason: "not_found" },
        });
        return sendNotFound(res);
      }

      auditRequest(req, {
        action: "delete",
        status: "success",
        domain: "compras_cartao",
        userId,
        targetId: compraId,
      });
      return res.json({ success: true });
    },

    deleteByCardRoute: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const compraId = getParam(req, "compraId");
      const scope = parseDeleteScope(req.query.scope);
      const parcelaId = typeof req.query.parcelaId === "string" ? req.query.parcelaId : undefined;
      const dryRun = parseDryRun(req.query.dryRun);

      const result = await service.deleteWithScope(compraId, userId, {
        scope,
        parcelaId,
        dryRun,
      });

      if ("error" in result) {
        if (result.error === "PARCELA_NOT_FOUND") {
          auditRequest(req, {
            action: "delete",
            status: "failure",
            domain: "compras_cartao",
            userId,
            targetId: compraId,
            details: { reason: "parcela_not_found", scope, parcelaId, dryRun },
          });
          return sendBadRequest(res, "Parcela not found");
        }

        auditRequest(req, {
          action: "delete",
          status: "failure",
          domain: "compras_cartao",
          userId,
          targetId: compraId,
          details: { reason: "not_found", scope, parcelaId, dryRun },
        });
        return sendNotFound(res);
      }

      auditRequest(req, {
        action: "delete",
        status: "success",
        domain: "compras_cartao",
        userId,
        targetId: compraId,
        details: {
          scope: result.impact.scope,
          dryRun: result.dryRun,
          parcelaId: result.impact.parcelaAlvo?.id ?? null,
          comprasRemovidas: result.impact.comprasRemovidas,
          parcelasRemovidas: result.impact.parcelasRemovidas,
          valorTotalRemovido: result.impact.valorTotalRemovido,
        },
      });
      return res.json(result);
    },
  };
}
