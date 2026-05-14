import type { Request, Response } from "express";
import { getUserId, sendBadRequest } from "./controller-utils";
import { ReportsService } from "../services/reports.service";
import { reportsOverviewQuerySchema } from "../validators/reports.validators";

function isValidationLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes("Período máximo permitido")
    || error.message.includes("endDate não pode ser menor que startDate");
}

export function createReportsController(service: ReportsService) {
  return {
    overview: async (req: Request, res: Response) => {
      const parsed = reportsOverviewQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      const userId = getUserId(req);
      try {
        const result = await service.getOverview(userId, parsed.data);
        return res.json(result);
      } catch (error) {
        if (isValidationLikeError(error)) {
          return sendBadRequest(res, (error as Error).message);
        }
        return res.status(500).json({ message: "Erro interno ao processar a requisição." });
      }
    },
  };
}
