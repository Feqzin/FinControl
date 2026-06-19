import type { Request, Response } from "express";
import { ServicosService } from "../services/servicos.service";
import {
  servicoBody,
  servicoCobrancaPagamentoBody,
  servicoCobrancaPagamentoCancelBody,
  servicoPagamentoBody,
  servicoPessoaBody,
  servicoPessoaUpdateBody,
  servicoUpdateBody,
} from "../validators/core-domain.validators";
import { getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils";

export function createServicosController(service: ServicosService) {
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
      return res.json(await service.createServico(userId, parsed.data));
    },

    updateServico: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const servicoId = getParam(req, "id");
      const parsed = servicoUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      const updated = await service.updateServico(servicoId, userId, parsed.data);
      if (!updated) {
        return sendNotFound(res);
      }
      return res.json(updated);
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

    listServicoCobrancaPagamentos: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.listServicoCobrancaPagamentos(userId));
    },

    createServicoCobrancaPagamento: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const servicoId = getParam(req, "id");
      const parsed = servicoCobrancaPagamentoBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.createServicoCobrancaPagamento(userId, servicoId, parsed.data);
      if ("error" in result) {
        if (result.error === "SERVICO_NOT_FOUND") {
          return sendNotFound(res);
        }
        if (result.error === "VALOR_ACIMA_DO_PENDENTE") {
          return sendBadRequest(res, `Valor acima do pendente para esta cobrança. Restante: ${result.remainingAmount.toFixed(2)}`);
        }
        return sendBadRequest(res, "Serviço sem cobrança pendente na competência informada.");
      }

      return res.json(result.created);
    },

    cancelServicoCobrancaPagamento: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const servicoId = getParam(req, "id");
      const paymentId = getParam(req, "paymentId");
      const parsed = servicoCobrancaPagamentoCancelBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.cancelServicoCobrancaPagamento(userId, servicoId, paymentId, parsed.data);
      if ("error" in result) {
        if (result.error === "SERVICO_NOT_FOUND" || result.error === "PAGAMENTO_NOT_FOUND") {
          return sendNotFound(res);
        }
      }

      return res.json(result.updated);
    },
  };
}
