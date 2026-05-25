import { z } from "zod";

const queryStringField = z
  .union([z.string(), z.array(z.string()), z.undefined()])
  .transform((value) => (Array.isArray(value) ? value[0] : value));

const optionalTrimmedField = queryStringField
  .pipe(z.string().trim().max(120).optional());

const optionalCategoryField = queryStringField
  .pipe(z.string().trim().max(60).optional());

const optionalOriginField = queryStringField
  .pipe(z.enum(["all", "official", "community"]).optional());

const nonEmptyTrimmed = z.string().trim().min(1);

const iconTextArray = z
  .array(z.string().trim().min(1).max(80))
  .max(60)
  .optional()
  .nullable()
  .transform((value) => (value ?? []).map((entry) => entry.trim()).filter(Boolean));

export const officialIconsListQuerySchema = z.object({
  search: optionalTrimmedField,
  category: optionalCategoryField,
  packId: optionalTrimmedField,
  origin: optionalOriginField,
});

export const addOfficialIconParamsSchema = z.object({
  id: nonEmptyTrimmed.max(128),
});

export const addOfficialPackParamsSchema = z.object({
  id: nonEmptyTrimmed.max(128),
});

export const publishCommunityIconBodySchema = z.object({
  userIconId: nonEmptyTrimmed.max(128),
});

export const communityIconParamsSchema = z.object({
  id: nonEmptyTrimmed.max(128),
});

export const adminCreateOfficialIconPackBodySchema = z.object({
  name: nonEmptyTrimmed.max(120),
  description: z.string().trim().max(280).optional().nullable(),
  category: z.string().trim().max(60).optional().nullable(),
  coverImageUrl: z.string().trim().max(2_000_000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const adminUpdateOfficialIconPackBodySchema = adminCreateOfficialIconPackBodySchema.partial()
  .refine((value) => Object.keys(value).length > 0, "Nenhum campo informado para atualização.");

const adminOfficialIconBodyBaseSchema = z.object({
  iconKey: nonEmptyTrimmed.max(120),
  name: nonEmptyTrimmed.max(120),
  imageUrl: z.string().trim().max(2_000_000).optional().nullable(),
  imageDataUrl: z.string().trim().max(2_000_000).optional().nullable(),
  storagePath: z.string().trim().max(2_000).optional().nullable(),
  category: z.string().trim().max(60).optional().nullable(),
  tags: iconTextArray,
  aliases: iconTextArray,
  packId: z.string().trim().max(128).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const adminCreateOfficialIconBodySchema = adminOfficialIconBodyBaseSchema.superRefine((value, ctx) => {
  if (!value.imageUrl && !value.imageDataUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Informe imageUrl ou imageDataUrl.",
      path: ["imageUrl"],
    });
  }
});

export const adminUpdateOfficialIconBodySchema = adminOfficialIconBodyBaseSchema.partial()
  .refine((value: Record<string, unknown>) => Object.keys(value).length > 0, "Nenhum campo informado para atualização.");

export type OfficialIconsListQueryInput = z.infer<typeof officialIconsListQuerySchema>;
export type AddOfficialIconParamsInput = z.infer<typeof addOfficialIconParamsSchema>;
export type AddOfficialPackParamsInput = z.infer<typeof addOfficialPackParamsSchema>;
export type PublishCommunityIconBodyInput = z.infer<typeof publishCommunityIconBodySchema>;
export type CommunityIconParamsInput = z.infer<typeof communityIconParamsSchema>;
export type AdminCreateOfficialIconPackBodyInput = z.infer<typeof adminCreateOfficialIconPackBodySchema>;
export type AdminUpdateOfficialIconPackBodyInput = z.infer<typeof adminUpdateOfficialIconPackBodySchema>;
export type AdminCreateOfficialIconBodyInput = z.infer<typeof adminCreateOfficialIconBodySchema>;
export type AdminUpdateOfficialIconBodyInput = z.infer<typeof adminUpdateOfficialIconBodySchema>;
