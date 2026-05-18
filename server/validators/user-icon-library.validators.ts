import { z } from "zod";

const nonEmptyTrimmed = z.string().trim().min(1);

export const userIconLibraryCreateBody = z.object({
  name: z.string().trim().max(120).optional().nullable(),
  category: z.string().trim().max(40).optional().nullable(),
  imageDataUrl: nonEmptyTrimmed.max(1_500_000, "Imagem muito grande."),
});

export type UserIconLibraryCreateBodyInput = z.infer<typeof userIconLibraryCreateBody>;
