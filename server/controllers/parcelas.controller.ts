import type { Request, Response } from "express";
import { formatMoneyFixed } from "../../utils/money";
import { normalizeIsoDate } from "../../utils/date";
import { ParcelasService } from "../services/parcelas.service";
import {
  anteciparParcelasBody,
  parcelaCompraUpdateBody,
  parcelaUpdateBody,
  parcelasCompraBulkBody,
} from "../validators/financial.validators";
import { auditRequest, getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils";

export function createParcelasController(service: ParcelasService) {
  return {
    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      res.json(await service.list(userId));
    },

    listByDivida: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const dividaId = getParam(req, "dividaId");
      res.json(await service.listByDivida(dividaId, userId));
    },

    update: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parcelaId = getParam(req, "id");
      const parsed = parcelaUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "parcelas",
          userId,
          targetId: parcelaId,
          details: { reason: "validation_error" },
        });
        return sendBadRequest(res, parsed.error.message);
      }

      const updated = await service.update(parcelaId, userId, parsed.data);
      if (!updated) {
        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "parcelas",
          userId,
          targetId: parcelaId,
          details: { reason: "not_found" },
        });
        return sendNotFound(res);
      }

      const isPayment = parsed.data.status === "pago" || (parsed.data.dataPagamento && parsed.data.formaPagamento);
      auditRequest(req, {
        action: isPayment ? "payment" : "update",
        status: "success",
        domain: "parcelas",
        userId,
        targetId: updated.id,
        details: {
          status: updated.status,
          valor: formatMoneyFixed(updated.valor),
          dataPagamento: normalizeIsoDate(updated.dataPagamento),
          formaPagamento: updated.formaPagamento,
        },
      });
      return res.json(updated);
    },

    antecipar: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = anteciparParcelasBody.safeParse(req.body);
      if (!parsed.success) {
        auditRequest(req, {
          action: "payment",
          status: "failure",
          domain: "parcelas_antecipar",
          userId,
          details: { reason: "validation_error" },
        });
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.antecipar(userId, parsed.data);
      auditRequest(req, {
        action: "payment",
        status: "success",
        domain: "parcelas_antecipar",
        userId,
        targetId: result.dividaId,
        details: {
          quantidadeSolicitada: result.quantidadeSolicitada,
          quantidadeAtualizada: result.quantidadeAtualizada,
          formaPagamento: result.formaPagamento,
          dataPagamento: normalizeIsoDate(result.dataPagamento),
          todasPagas: result.todasPagas,
        },
      });
      return res.json({ updated: result.quantidadeAtualizada, todasPagas: result.todasPagas });
    },

    delete: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parcelaId = getParam(req, "id");
      const deleted = await service.delete(parcelaId, userId);
      if (!deleted) {
        auditRequest(req, {
          action: "delete",
          status: "failure",
          domain: "parcelas",
          userId,
          targetId: parcelaId,
          details: { reason: "not_found" },
        });
        return sendNotFound(res);
      }

      auditRequest(req, {
        action: "delete",
        status: "success",
        domain: "parcelas",
        userId,
        targetId: parcelaId,
      });
      return res.json({ success: true });
    },

    listCompra: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const compraId = getParam(req, "compraId");
      const result = await service.listParcelasCompra(compraId, userId);
      if ("error" in result) {
        return sendNotFound(res, "Compra not found");
      }
      return res.json(result.rows);
    },

    updateCompra: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parcelaCompraId = getParam(req, "id");
      const parsed = parcelaCompraUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "parcelas_compra",
          userId,
          targetId: parcelaCompraId,
          details: { reason: "validation_error" },
        });
        return sendBadRequest(res, parsed.error.message);
      }
      const updated = await service.updateParcelaCompra(parcelaCompraId, userId, parsed.data);
      if (!updated) {
        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "parcelas_compra",
          userId,
          targetId: parcelaCompraId,
          details: { reason: "not_found" },
        });
        return sendNotFound(res);
      }

      const isPayment = parsed.data.statusCartao === "pago" || Boolean(parsed.data.dataPagamentoCartao);
      auditRequest(req, {
        action: isPayment ? "payment" : "update",
        status: "success",
        domain: "parcelas_compra",
        userId,
        targetId: updated.id,
        details: {
          compraCartaoId: updated.compraCartaoId,
          numero: updated.numero,
          statusCartao: updated.statusCartao,
          statusPessoa: updated.statusPessoa,
          valor: formatMoneyFixed(updated.valor),
          dataPagamentoCartao: normalizeIsoDate(updated.dataPagamentoCartao),
          dataPagamentoPessoa: normalizeIsoDate(updated.dataPagamentoPessoa),
        },
      });
      return res.json(updated);
    },

    replaceCompraBulk: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = parcelasCompraBulkBody.safeParse(req.body);
      if (!parsed.success) {
        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "parcelas_compra_bulk",
          userId,
          details: { reason: "validation_error" },
        });
        return sendBadRequest(res, parsed.error.message);
      }
      const result = await service.replaceParcelasCompraBulk(userId, parsed.data);
      if ("error" in result) {
        auditRequest(req, {
          action: "update",
          status: "failure",
          domain: "parcelas_compra_bulk",
          userId,
          targetId: parsed.data.compraCartaoId,
          details: { reason: "compra_not_found" },
        });
        return sendBadRequest(res, "Compra not found");
      }

      auditRequest(req, {
        action: "update",
        status: "success",
        domain: "parcelas_compra_bulk",
        userId,
        targetId: parsed.data.compraCartaoId,
        details: {
          totalParcelas: result.created.length,
        },
      });
      return res.json(result.created);
    },
  };
}
