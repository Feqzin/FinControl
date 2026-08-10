import type { Request, Response } from "express";
import { CnpjDasService } from "../services/cnpj-das.service";
import { cnpjDasPreviewBody, cnpjDasRecalculateBody, cnpjDasSaveBody } from "../validators/cnpj-das.validators";
import { getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils";

function sendCalculationError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Não foi possível calcular o DAS.";
  const status = message.includes("Selic") || message.includes("Banco Central") ? 503 : 422;
  return res.status(status).json({ message });
}

export function createCnpjDasController(service: CnpjDasService) {
  return {
    list: async (req: Request, res: Response) => res.json(await service.list(getUserId(req))),

    preview: async (req: Request, res: Response) => {
      const parsed = cnpjDasPreviewBody.safeParse(req.body);
      if (!parsed.success) return sendBadRequest(res, parsed.error.message);
      try {
        return res.json(await service.preview(parsed.data));
      } catch (error) {
        return sendCalculationError(res, error);
      }
    },

    save: async (req: Request, res: Response) => {
      const parsed = cnpjDasSaveBody.safeParse(req.body);
      if (!parsed.success) return sendBadRequest(res, parsed.error.message);
      try {
        return res.status(201).json(await service.save(getUserId(req), parsed.data));
      } catch (error) {
        return sendCalculationError(res, error);
      }
    },

    recalculate: async (req: Request, res: Response) => {
      const companyId = getParam(req, "id");
      if (!companyId) return sendBadRequest(res, "CNPJ inválido.");
      const parsed = cnpjDasRecalculateBody.safeParse(req.body);
      if (!parsed.success) return sendBadRequest(res, parsed.error.message);
      try {
        const result = await service.recalculate(getUserId(req), companyId, parsed.data.dataCalculo);
        if (!result) return sendNotFound(res, "CNPJ não encontrado.");
        return res.json(result);
      } catch (error) {
        return sendCalculationError(res, error);
      }
    },
  };
}
