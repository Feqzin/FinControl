import type { Request, Response } from "express";
import { ENV } from "../env";
import { OfficialIconLibraryService, OfficialIconNotFoundError, OfficialIconPackNotFoundError } from "../services/official-icons.service";
import {
  addOfficialIconParamsSchema,
  addOfficialPackParamsSchema,
  adminCreateOfficialIconBodySchema,
  adminCreateOfficialIconPackBodySchema,
  adminUpdateOfficialIconBodySchema,
  adminUpdateOfficialIconPackBodySchema,
  officialIconsListQuerySchema,
} from "../validators/official-icons.validators";
import { getUserId, sendBadRequest } from "./controller-utils";

function normalizeIdentifier(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isOfficialIconAdmin(req: Request): boolean {
  const allowed = ENV.officialIcons.adminIdentifiers;
  if (allowed.length === 0) return false;
  const user = req.user as { id?: unknown; username?: unknown } | undefined;
  const userId = typeof user?.id === "string" ? normalizeIdentifier(user.id) : "";
  const username = typeof user?.username === "string" ? normalizeIdentifier(user.username) : "";
  if (!userId && !username) return false;
  return allowed.some((identifier) => identifier === userId || identifier === username);
}

function ensureAdmin(req: Request, res: Response): boolean {
  if (isOfficialIconAdmin(req)) return true;
  res.status(403).json({ message: "Apenas admin pode gerenciar ícones oficiais." });
  return false;
}

function mapServiceErrorToResponse(res: Response, error: unknown): Response | null {
  if (error instanceof OfficialIconNotFoundError || error instanceof OfficialIconPackNotFoundError) {
    return res.status(404).json({ message: error.message });
  }
  if (error instanceof Error) {
    return res.status(400).json({ message: error.message });
  }
  return null;
}

export function createOfficialIconsController(service: OfficialIconLibraryService) {
  return {
    listOfficial: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = officialIconsListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      const icons = await service.listOfficialIcons(userId, parsed.data);
      return res.json({ icons });
    },

    listPacks: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const packs = await service.listOfficialPacks(userId);
      return res.json({ packs });
    },

    addOfficialIconToLibrary: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = addOfficialIconParamsSchema.safeParse(req.params);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      try {
        const result = await service.addOfficialIconToLibrary(userId, parsed.data.id);
        return res.status(201).json(result);
      } catch (error) {
        return mapServiceErrorToResponse(res, error) ?? res.status(500).json({ message: "Erro interno ao adicionar ícone." });
      }
    },

    addOfficialPackToLibrary: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = addOfficialPackParamsSchema.safeParse(req.params);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      try {
        const result = await service.addOfficialPackToLibrary(userId, parsed.data.id);
        return res.status(201).json(result);
      } catch (error) {
        return mapServiceErrorToResponse(res, error) ?? res.status(500).json({ message: "Erro interno ao adicionar pack." });
      }
    },

    adminCreatePack: async (req: Request, res: Response) => {
      if (!ensureAdmin(req, res)) return;
      const parsed = adminCreateOfficialIconPackBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      try {
        const userId = getUserId(req);
        const pack = await service.createOfficialPack(userId, parsed.data);
        return res.status(201).json({ pack });
      } catch (error) {
        return mapServiceErrorToResponse(res, error) ?? res.status(500).json({ message: "Erro interno ao criar pack oficial." });
      }
    },

    adminUpdatePack: async (req: Request, res: Response) => {
      if (!ensureAdmin(req, res)) return;
      const params = addOfficialPackParamsSchema.safeParse(req.params);
      if (!params.success) {
        return sendBadRequest(res, params.error.message);
      }
      const parsed = adminUpdateOfficialIconPackBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      try {
        const pack = await service.updateOfficialPack(params.data.id, parsed.data);
        return res.json({ pack });
      } catch (error) {
        return mapServiceErrorToResponse(res, error) ?? res.status(500).json({ message: "Erro interno ao atualizar pack oficial." });
      }
    },

    adminCreateOfficialIcon: async (req: Request, res: Response) => {
      if (!ensureAdmin(req, res)) return;
      const parsed = adminCreateOfficialIconBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      try {
        const userId = getUserId(req);
        const icon = await service.createOfficialIcon(userId, parsed.data);
        return res.status(201).json({ icon });
      } catch (error) {
        return mapServiceErrorToResponse(res, error) ?? res.status(500).json({ message: "Erro interno ao criar ícone oficial." });
      }
    },

    adminUpdateOfficialIcon: async (req: Request, res: Response) => {
      if (!ensureAdmin(req, res)) return;
      const params = addOfficialIconParamsSchema.safeParse(req.params);
      if (!params.success) {
        return sendBadRequest(res, params.error.message);
      }
      const parsed = adminUpdateOfficialIconBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      try {
        const icon = await service.updateOfficialIcon(params.data.id, parsed.data);
        return res.json({ icon });
      } catch (error) {
        return mapServiceErrorToResponse(res, error) ?? res.status(500).json({ message: "Erro interno ao atualizar ícone oficial." });
      }
    },
  };
}
