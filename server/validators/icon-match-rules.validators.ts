import { z } from "zod";

const normalizedString = z.string().trim().min(1);

const termInputSchema = z
  .union([
    normalizedString,
    z.array(normalizedString).min(1).max(25),
  ])
  .transform((value) => (Array.isArray(value) ? value : [value]));

export const iconMatchRuleCreateBody = z.object({
  iconId: normalizedString.max(2_000_000, "iconId inválido."),
  terms: termInputSchema,
});

export type IconMatchRuleCreateBodyInput = z.infer<typeof iconMatchRuleCreateBody>;
