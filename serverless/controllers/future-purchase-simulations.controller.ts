import type { Request, Response } from "express";
import { FuturePurchaseSimulationsService } from "../services/future-purchase-simulations.service.js";
import { futurePurchaseSimulationUpsertBody } from "../validators/future-purchase-simulations.validators.js";
import {
  getParam,
  getUserId,
  sendBadRequest,
  sendNotFound,
} from "./controller-utils.js";

export function createFuturePurchaseSimulationsController(
  service: FuturePurchaseSimulationsService,
) {
  return {
    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.list(userId));
    },

    get: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const simulationId = getParam(req, "id");
      if (!simulationId) {
        return sendBadRequest(res, "Simulação inválida.");
      }

      const simulation = await service.get(userId, simulationId);
      if (!simulation) {
        return sendNotFound(res, "Simulação não encontrada.");
      }

      return res.json(simulation);
    },

    create: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = futurePurchaseSimulationUpsertBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.create(userId, parsed.data);
      if ("error" in result) {
        return sendBadRequest(res, "Cartão inválido para o usuário.");
      }

      return res.status(201).json(result.created);
    },

    update: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const simulationId = getParam(req, "id");
      if (!simulationId) {
        return sendBadRequest(res, "Simulação inválida.");
      }

      const parsed = futurePurchaseSimulationUpsertBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.update(userId, simulationId, parsed.data);
      if ("error" in result) {
        if (result.error === "CARD_NOT_FOUND") {
          return sendBadRequest(res, "Cartão inválido para o usuário.");
        }
        return sendNotFound(res, "Simulação não encontrada.");
      }

      return res.json(result.updated);
    },

    remove: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const simulationId = getParam(req, "id");
      if (!simulationId) {
        return sendBadRequest(res, "Simulação inválida.");
      }

      const deleted = await service.delete(userId, simulationId);
      if (!deleted) {
        return sendNotFound(res, "Simulação não encontrada.");
      }

      return res.json({ success: true });
    },
  };
}
