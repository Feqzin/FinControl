import type { Request, Response } from "express";
import { PessoasService } from "../services/pessoas.service.js";
import { pessoaBody, pessoaSaldoMovimentacaoBody, pessoaUpdateBody } from "../validators/core-domain.validators.js";
import { getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils.js";

export function createPessoasController(service: PessoasService) {
  return {
    listSaldoMovimentacoesByUser: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.listSaldoMovimentacoesByUser(userId));
    },

    listSaldoMovimentacoes: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const pessoaId = getParam(req, "pessoaId");
      const result = await service.listSaldoMovimentacoes(pessoaId, userId);
      if (!result) {
        return sendNotFound(res, "Pessoa not found");
      }
      return res.json(result);
    },

    createSaldoMovimentacao: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const pessoaId = getParam(req, "pessoaId");
      const parsed = pessoaSaldoMovimentacaoBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.createSaldoMovimentacao(pessoaId, userId, parsed.data);
      if ("error" in result) {
        if (result.error === "PESSOA_NOT_FOUND") {
          return sendNotFound(res, "Pessoa not found");
        }
        if (result.error === "VALOR_INVALIDO") {
          return sendBadRequest(res, "Valor invalido. Informe um valor maior que zero.");
        }
        if (result.error === "DIVIDA_NOT_FOUND") {
          return sendBadRequest(res, "Divida vinculada nao encontrada.");
        }
        if (result.error === "DIVIDA_NOT_LINKED_TO_PESSOA") {
          return sendBadRequest(res, "Divida vinculada nao pertence a esta pessoa.");
        }
        if (result.error === "COMPRA_NOT_FOUND") {
          return sendBadRequest(res, "Compra vinculada nao encontrada.");
        }
        if (result.error === "COMPRA_NOT_LINKED_TO_PESSOA") {
          return sendBadRequest(res, "Compra vinculada nao pertence a esta pessoa.");
        }
        if (result.error === "PARCELA_COMPRA_NOT_FOUND") {
          return sendBadRequest(res, "Parcela vinculada nao encontrada.");
        }
        if (result.error === "PARCELA_COMPRA_NOT_LINKED_TO_PESSOA") {
          return sendBadRequest(res, "Parcela vinculada nao pertence a esta pessoa.");
        }
        if (result.error === "SERVICO_PESSOA_NOT_FOUND") {
          return sendBadRequest(res, "Servico vinculado nao encontrado.");
        }
        return sendBadRequest(res, "Servico vinculado nao pertence a esta pessoa.");
      }

      return res.status(201).json(result.created);
    },

    getResumo: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const pessoaId = getParam(req, "pessoaId");
      const resumo = await service.getResumo(pessoaId, userId);
      if (!resumo) {
        return sendNotFound(res, "Pessoa not found");
      }
      return res.json(resumo);
    },

    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.list(userId));
    },

    create: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = pessoaBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      return res.json(await service.create(userId, parsed.data));
    },

    update: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const pessoaId = getParam(req, "id");
      const parsed = pessoaUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      const updated = await service.update(pessoaId, userId, parsed.data);
      if (!updated) {
        return sendNotFound(res);
      }
      return res.json(updated);
    },

    delete: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const pessoaId = getParam(req, "id");
      const deleted = await service.delete(pessoaId, userId);
      if (!deleted) {
        return sendNotFound(res);
      }
      return res.json({ success: true });
    },
  };
}
