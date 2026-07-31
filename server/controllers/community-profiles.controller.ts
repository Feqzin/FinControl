import type { Request, Response } from "express";
import {
  CommunityCreatorNotFoundError,
  CommunityProfilesService,
} from "../services/community-profiles.service";
import {
  communityCreatorParamsSchema,
  updateCommunityProfileBodySchema,
} from "../validators/community-profiles.validators";
import { getUserId, sendBadRequest } from "./controller-utils";

function handleCommunityProfileError(res: Response, error: unknown): Response {
  if (
    error instanceof CommunityCreatorNotFoundError
    || (error instanceof Error && error.name === "CommunityCreatorNotFoundError")
  ) {
    return res.status(404).json({ message: error.message });
  }
  return res.status(500).json({ message: "Erro interno ao carregar perfil de criador." });
}

export function createCommunityProfilesController(service: CommunityProfilesService) {
  return {
    getOwnProfile: async (req: Request, res: Response) => {
      try {
        const profile = await service.getOwnProfile(getUserId(req));
        return res.json(profile);
      } catch (error) {
        return handleCommunityProfileError(res, error);
      }
    },

    updateOwnProfile: async (req: Request, res: Response) => {
      const parsed = updateCommunityProfileBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      try {
        const profile = await service.updateOwnProfile(getUserId(req), parsed.data);
        return res.json(profile);
      } catch (error) {
        return handleCommunityProfileError(res, error);
      }
    },

    getCreatorProfile: async (req: Request, res: Response) => {
      const parsed = communityCreatorParamsSchema.safeParse(req.params);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      try {
        const profile = await service.getCreatorProfile(
          getUserId(req),
          parsed.data.publicCode,
        );
        return res.json(profile);
      } catch (error) {
        return handleCommunityProfileError(res, error);
      }
    },
  };
}
