import { z } from "zod";

export const communityCreatorParamsSchema = z.object({
  publicCode: z.string().trim().min(1).max(80).regex(
    /^[A-Za-z0-9_-]+$/,
    "Código público inválido.",
  ),
});

export const updateCommunityProfileBodySchema = z.object({
  bio: z.string().trim().max(280).optional().nullable(),
  profileVisibility: z.enum(["private", "community"]).optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  "Nenhum campo informado para atualização.",
);

export type UpdateCommunityProfileBodyInput = z.infer<typeof updateCommunityProfileBodySchema>;
