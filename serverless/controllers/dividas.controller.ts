import type { Request, Response } from "express";
import { formatMoneyFixed } from "../../utils/money.js";
import { normalizeIsoDate } from "../../utils/date.js";
import { DividasService, type DividaListStatus } from "../services/dividas.service.js";
import {
  dividaBody,
  dividaParceladoBody,
  dividaUpdateBody,
} from "../validators/financial.validators.js";
import { auditRequest, getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils.js";

function resolveDividaListStatus(raw: unknown): DividaListStatus {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "all" || normalized === "todos") return "all";
  if (normalized === "removed" || normalized === "removidas" || normalized === "inativas") return "removed";
  return "active";
}

export function createDividasController(service: DividasService) {
  return {
    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const status = resolveDividaListStatus(req.query.status);
      res.json(await service.list(userId, status));
    },

    listByPessoa: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const pessoaId = getParam(req, "pessoaId");
      res.json(await service.listByPessoa(pessoaId, userId));
    },

    create: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = dividaBody.safeParse(req.body);
      if (!parsed.success) {
        auditRequest(req, {
          action: "create",
          status: "failure",
          domain: "dividas",
          userId,
          details: { reason: "validation_error" },
        });
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.create(parsed.data, userId);
      if ("error" in result) {
        auditRequest(req, {
          action: "create",
          status: "failure",
          domain: "dividas",
          userId,
          details: { reason: "pessoa_not_found", pessoaId: parsed.data.pessoaId },
        });
        return sendBadRequest(res, "Pessoa not found");
      }

      const { created } = result;
      auditRequest(req, {
        action: "create",
        status: "success",
        domain: "dividas",
        userId,
        targetId: created.id,
        details: {
          pessoaId: created.pessoaId,
          tipo: created.tipo,
          valor: formatMoneyFixed(created.valor),
          dataVencimento: normalizeIsoDate(created.dataVencimento),
        },
      });
      return res.json(created);
    },

    createParcelado: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = dividaParceladoBody.safeParse(req.body);
      if (!parsed.success) {
        auditRequest(req, {
          action: "create",
          status: "failure",
          domain: "dividas_parcelado",
          userId,
          details: { reason: "validation_error" },
        });
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.createParcelado(parsed.data, userId);
      if ("error" in result) {
        auditRequest(req, {
          action: "create",
          status: "failure",
          domain: "dividas_parcelado",
          userId,
          details: { reason: "pessoa_not_found", pessoaId: parsed.data.pessoaId },
        });
        return sendBadRequest(res, "Pessoa not found");
      }

      const { divida, parcelas } = result;
      auditRequest(req, {
        action: "create",
        status: "success",
        domain: "dividas_parcelado",
        userId,
        targetId: divida.id,
        details: {
          pessoaId: divida.pessoaId,
          tipo: divida.tipo,
          totalParcelas: parcelas.length,
          valorTotal: formatMoneyFixed(divida.valorTotal ?? divida.valor),
        },
      });
      return res.json({ divida, parcelas });
    },

    update: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const dividaId = getParam(req, "id");
      const parsed = dividaUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "dividas",
          userId,
          targetId: dividaId,
          details: { reason: "validation_error" },
        });
        return sendBadRequest(res, parsed.error.message);
      }

      const updated = await service.update(dividaId, userId, parsed.data);
      if (!updated) {
        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "dividas",
          userId,
          targetId: dividaId,
          details: { reason: "not_found" },
        });
        return sendNotFound(res);
      }

      auditRequest(req, {
        action: "update",
        status: "success",
        domain: "dividas",
        userId,
        targetId: updated.id,
        details: {
          status: updated.status,
          dataPagamento: normalizeIsoDate(updated.dataPagamento),
        },
      });
      return res.json(updated);
    },

    delete: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const dividaId = getParam(req, "id");
      const deleted = await service.delete(dividaId, userId);
      if (!deleted) {
        auditRequest(req, {
          action: "delete",
          status: "failure",
          domain: "dividas",
          userId,
          targetId: dividaId,
          details: { reason: "not_found" },
        });
        return sendNotFound(res);
      }

      auditRequest(req, {
        action: "delete",
        status: "success",
        domain: "dividas",
        userId,
        targetId: dividaId,
      });
      return res.json({ success: true });
    },

    restore: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const dividaId = getParam(req, "id");
      const restored = await service.restore(dividaId, userId);
      if (!restored) {
        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "dividas_restore",
          userId,
          targetId: dividaId,
          details: { reason: "not_found" },
        });
        return sendNotFound(res);
      }

      auditRequest(req, {
        action: "update",
        status: "success",
        domain: "dividas_restore",
        userId,
        targetId: restored.id,
      });
      return res.json(restored);
    },

    deletePermanent: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const dividaId = getParam(req, "id");
      const result = await service.deletePermanent(dividaId, userId);

      if ("error" in result) {
        if (result.error === "DIVIDA_ATIVA") {
          auditRequest(req, {
            action: "delete",
            status: "failure",
            domain: "dividas_permanent_delete",
            userId,
            targetId: dividaId,
            details: { reason: "divida_ativa" },
          });
          return sendBadRequest(res, "Remova a dívida antes de excluir permanentemente.");
        }

        auditRequest(req, {
          action: "delete",
          status: "failure",
          domain: "dividas_permanent_delete",
          userId,
          targetId: dividaId,
          details: { reason: "not_found" },
        });
        return sendNotFound(res);
      }

      auditRequest(req, {
        action: "delete",
        status: "success",
        domain: "dividas_permanent_delete",
        userId,
        targetId: dividaId,
      });
      return res.json({ success: true });
    },

    recalcular: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const dividaId = getParam(req, "id");
      const result = await service.recalcular(dividaId, userId, {
        novoTotal: req.body?.novoTotal,
        primeiroVencimento: req.body?.primeiroVencimento,
      });

      if (!result.ok) {
        auditRequest(req, {
          action: "update",
          status: result.status >= 500 ? "error" : "failure",
          domain: "dividas_recalculo",
          userId,
          targetId: dividaId,
          details: { reason: result.message },
        });
        if (result.status === 404) {
          return sendNotFound(res, result.message);
        }
        return res.status(result.status).json({ message: result.message });
      }

      auditRequest(req, {
        action: "update",
        status: "success",
        domain: "dividas_recalculo",
        userId,
        targetId: dividaId,
        details: {
          parcelasPagas: result.data.pagas,
          parcelasNovas: result.data.novas,
          valorRestante: result.data.valorRestante,
        },
      });
      return res.json(result.data);
    },
  };
}
