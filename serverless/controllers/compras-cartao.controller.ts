import type { Request, Response } from "express";
import { formatMoneyFixed } from "../../utils/money.js";
import { normalizeIsoDate } from "../../utils/date.js";
import { ComprasCartaoService } from "../services/compras-cartao.service.js";
import { compraBody, compraUpdateBody } from "../validators/financial.validators.js";
import { auditRequest, getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils.js";

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
  };
}
