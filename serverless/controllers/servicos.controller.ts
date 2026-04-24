import type { Request, Response } from "express";
import { enforcePlanLimit } from "../subscription-access.js";
import { BillingService } from "../services/billing.service.js";
import { ServicosService } from "../services/servicos.service.js";
import {
  servicoBody,
  servicoPagamentoBody,
  servicoPessoaBody,
  servicoPessoaUpdateBody,
  servicoUpdateBody,
} from "../validators/core-domain.validators.js";
import {
  getParam,
  getUserId,
  sendBadRequest,
  sendNotFound,
  sendPlanLimitConflict,
} from "./controller-utils.js";

export function createServicosController(service: ServicosService) {
  const billingService = new BillingService();

  return {
    listServicos: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.listServicos(userId));
    },

    createServico: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = servicoBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      const currentUsage = (await service.listServicos(userId)).length;
      const effectiveAccess = await billingService.syncUserSubscriptionTier(
        userId,
        "plan_limit_servicos_create",
      );
      const limitResult = enforcePlanLimit(
        { subscriptionTier: effectiveAccess.effectiveTier },
        "servicos",
        currentUsage,
      );
      if (!limitResult.allowed) {
        return sendPlanLimitConflict(res, limitResult.error);
      }

      const result = await service.createServico(userId, parsed.data);
      if ("error" in result) {
        return sendBadRequest(res, "Compra de cartao nao encontrada para vinculo");
      }
      return res.json(result.created);
    },

    updateServico: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const servicoId = getParam(req, "id");
      const parsed = servicoUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      const result = await service.updateServico(servicoId, userId, parsed.data);
      if ("error" in result) {
        return sendBadRequest(res, "Compra de cartao nao encontrada para vinculo");
      }
      if (!result.updated) {
        return sendNotFound(res);
      }
      return res.json(result.updated);
    },

    deleteServico: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const servicoId = getParam(req, "id");
      const deleted = await service.deleteServico(servicoId, userId);
      if (!deleted) {
        return sendNotFound(res);
      }
      return res.json({ success: true });
    },

    listServicoPessoas: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.listServicoPessoas(userId));
    },

    createServicoPessoa: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = servicoPessoaBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.createServicoPessoa(userId, parsed.data);
      if ("error" in result) {
        if (result.error === "SERVICO_NOT_FOUND") {
          return sendBadRequest(res, "Servico not found");
        }
        return sendBadRequest(res, "Pessoa not found");
      }

      return res.json(result.created);
    },

    updateServicoPessoa: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const servicoPessoaId = getParam(req, "id");
      const parsed = servicoPessoaUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.updateServicoPessoa(servicoPessoaId, userId, parsed.data);
      if ("error" in result) {
        if (result.error === "SERVICO_NOT_FOUND") {
          return sendBadRequest(res, "Servico not found");
        }
        return sendBadRequest(res, "Pessoa not found");
      }
      if (!result.updated) {
        return sendNotFound(res);
      }
      return res.json(result.updated);
    },

    deleteServicoPessoa: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const servicoPessoaId = getParam(req, "id");
      const deleted = await service.deleteServicoPessoa(servicoPessoaId, userId);
      if (!deleted) {
        return sendNotFound(res);
      }
      return res.json({ success: true });
    },

    listServicoPagamentos: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.listServicoPagamentos(userId));
    },

    createServicoPagamento: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = servicoPagamentoBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.createServicoPagamento(userId, parsed.data);
      if ("error" in result) {
        return sendBadRequest(res, "ServicoPessoa not found");
      }

      return res.json(result.created);
    },

    deleteServicoPagamento: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const servicoPagamentoId = getParam(req, "id");
      const deleted = await service.deleteServicoPagamento(servicoPagamentoId, userId);
      if (!deleted) {
        return sendNotFound(res);
      }
      return res.json({ success: true });
    },
  };
}
