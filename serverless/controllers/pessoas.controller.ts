import type { Request, Response } from "express";
import { PessoasService } from "../services/pessoas.service.js";
import {
  pessoaAbaterSaldoDividaBody,
  pessoaAbaterSaldoServicoBody,
  pessoaBody,
  pessoaSaldoMovimentacaoBody,
  pessoaUpdateBody,
} from "../validators/core-domain.validators.js";
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

    abaterSaldoEmDivida: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const pessoaId = getParam(req, "pessoaId");
      const dividaId = getParam(req, "dividaId");
      const parsed = pessoaAbaterSaldoDividaBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.abaterSaldoEmDivida(pessoaId, dividaId, userId, parsed.data);
      if ("error" in result) {
        if (result.error === "PESSOA_NOT_FOUND") {
          return sendNotFound(res, "Pessoa not found");
        }
        if (result.error === "DIVIDA_NOT_FOUND") {
          return sendNotFound(res, "Divida not found");
        }
        if (result.error === "DIVIDA_NOT_LINKED_TO_PESSOA") {
          return sendBadRequest(res, "Divida nao pertence a esta pessoa.");
        }
        if (result.error === "DIVIDA_TIPO_INVALIDO") {
          return sendBadRequest(res, "Somente dividas pessoais do tipo 'receber' podem ser abatidas com saldo.");
        }
        if (result.error === "DIVIDA_PARCELADA_NAO_SUPORTADA") {
          return sendBadRequest(res, "Abatimento por saldo para divida parcelada ainda nao esta disponivel.");
        }
        if (result.error === "DIVIDA_JA_PAGA") {
          return sendBadRequest(res, "A divida ja esta quitada.");
        }
        if (result.error === "DIVIDA_SEM_PENDENCIA") {
          return sendBadRequest(res, "A divida nao possui valor pendente para abatimento.");
        }
        if (result.error === "VALOR_INVALIDO") {
          return sendBadRequest(res, "Valor invalido. Informe um valor maior que zero.");
        }
        if (result.error === "SALDO_INSUFICIENTE") {
          return sendBadRequest(res, "Saldo insuficiente para realizar o abatimento.");
        }
        if (result.error === "VALOR_MAIOR_QUE_SALDO") {
          return sendBadRequest(res, "O valor de abatimento nao pode ser maior que o saldo disponivel.");
        }
        return sendBadRequest(res, "O valor de abatimento nao pode ser maior que o valor pendente da divida.");
      }

      return res.status(201).json(result.aplicado);
    },

    abaterSaldoEmServico: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const pessoaId = getParam(req, "pessoaId");
      const servicoPessoaId = getParam(req, "servicoPessoaId");
      const parsed = pessoaAbaterSaldoServicoBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.abaterSaldoEmServico(pessoaId, servicoPessoaId, userId, parsed.data);
      if ("error" in result) {
        if (result.error === "PESSOA_NOT_FOUND") {
          return sendNotFound(res, "Pessoa not found");
        }
        if (result.error === "SERVICO_PESSOA_NOT_FOUND") {
          return sendNotFound(res, "ServicoPessoa not found");
        }
        if (result.error === "SERVICO_PESSOA_NOT_LINKED_TO_PESSOA") {
          return sendBadRequest(res, "Servico vinculado nao pertence a esta pessoa.");
        }
        if (result.error === "VALOR_INVALIDO") {
          return sendBadRequest(res, "Valor invalido. Informe um valor maior que zero.");
        }
        if (result.error === "SALDO_INSUFICIENTE") {
          return sendBadRequest(res, "Saldo insuficiente para abater este servico.");
        }
        if (result.error === "VALOR_MAIOR_QUE_SALDO") {
          return sendBadRequest(res, "O valor de abatimento nao pode ser maior que o saldo disponivel.");
        }
        if (result.error === "VALOR_MAIOR_QUE_PENDENTE") {
          return sendBadRequest(res, "O valor de abatimento nao pode ser maior que o pendente do servico no mes.");
        }
        return sendBadRequest(res, "Este servico ja esta quitado no mes informado.");
      }

      return res.status(201).json(result.aplicado);
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
