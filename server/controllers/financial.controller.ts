import type { Request, Response } from "express";
import { FinancialService, type ScoreSimulationInput } from "../services/financial.service";
import { getUserId } from "./controller-utils";

function parseNonNegativeQueryNumber(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n < 0 ? 0 : n;
}

export function createFinancialController(service: FinancialService) {
  return {
    summary: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const month = typeof req.query.month === "string" ? req.query.month : undefined;
      const summary = await service.getSummary(userId, month);
      return res.json(summary);
    },

    score: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const simulation: ScoreSimulationInput = {
        quitarDivida: parseNonNegativeQueryNumber(req.query.quitarDivida),
        reducaoDespesas: parseNonNegativeQueryNumber(req.query.reducaoDespesas),
      };
      return res.json(await service.getScore(userId, simulation));
    },

    insights: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.getInsights(userId));
    },
  };
}
