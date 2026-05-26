import { z } from "zod";

const nonEmptyTrimmed = z.string().trim().min(1);

const categoryField = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" ? value.trim() : value))
  .refine(
    (value) => value === null || value === undefined || value.length <= 40,
    "Categoria inválida.",
  );

const keywordsField = z
  .union([
    z.string(),
    z.array(z.string()),
    z.null(),
    z.undefined(),
  ])
  .transform((value) => {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
    }
    if (typeof value === "string") {
      return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    return [];
  });

export const userIconLibraryCreateBody = z.object({
  name: z.string().trim().min(2, "Nome do ícone obrigatório.").max(120),
  category: categoryField.optional(),
  keywords: keywordsField.optional(),
  originalFileName: z.string().trim().max(140).optional().nullable(),
  imageDataUrl: nonEmptyTrimmed.max(1_500_000, "Imagem muito grande."),
});

export const userIconLibraryUpdateBody = z.object({
  name: z.string().trim().min(2, "Nome do ícone obrigatório.").max(120).optional(),
  category: categoryField.optional(),
  keywords: keywordsField.optional(),
}).refine(
  (value) => Object.keys(value).length > 0,
  "Nenhum campo informado para atualização.",
);

const userIconLibraryBatchItemBody = z.object({
  name: z.string().trim().min(2, "Nome do ícone obrigatório.").max(120),
  category: categoryField.optional(),
  keywords: keywordsField.optional(),
  originalFileName: z.string().trim().max(140).optional().nullable(),
  imageDataUrl: nonEmptyTrimmed.max(1_500_000, "Imagem muito grande."),
});

export const userIconLibraryBatchCreateBody = z.object({
  defaultCategory: categoryField.optional(),
  defaultKeywords: keywordsField.optional(),
  icons: z.array(userIconLibraryBatchItemBody)
    .min(1, "Informe pelo menos um ícone.")
    .max(30, "O limite por lote é de 30 ícones."),
});

export type UserIconLibraryCreateBodyInput = z.infer<typeof userIconLibraryCreateBody>;
export type UserIconLibraryUpdateBodyInput = z.infer<typeof userIconLibraryUpdateBody>;
export type UserIconLibraryBatchCreateBodyInput = z.infer<typeof userIconLibraryBatchCreateBody>;
