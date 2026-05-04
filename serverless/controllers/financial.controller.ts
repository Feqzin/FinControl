import type { Request, Response } from "express";
import { FinancialService } from "../services/financial.service.js";
import { getUserId } from "./controller-utils.js";
import { parseFinancialQuery } from "../validators/financial.validators.js";

export function createFinancialController(service: FinancialService) {
  return {
    cardSummary: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.getCardSummaries(userId));
    },

    overview: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsedQuery = parseFinancialQuery(req.query as Record<string, unknown>);
      const overview = await service.getDashboardOverview(userId, parsedQuery.month, parsedQuery.simulation);
      return res.json(overview);
    },

    summary: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsedQuery = parseFinancialQuery(req.query as Record<string, unknown>);
      const summary = await service.getSummary(userId, parsedQuery.month, parsedQuery.simulation);
      return res.json(summary);
    },

    score: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsedQuery = parseFinancialQuery(req.query as Record<string, unknown>);
      return res.json(await service.getScore(userId, parsedQuery.simulation));
    },

    insights: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsedQuery = parseFinancialQuery(req.query as Record<string, unknown>);
      return res.json(await service.getInsights(userId, parsedQuery.simulation));
    },
  };
}
