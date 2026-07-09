import { z } from "zod";
import {
  INVALID_ICON_ID_REFERENCE_MESSAGE,
  isRemoteIconReference,
} from "@shared/icon-persistence";

const normalizedString = z.string().trim().min(1);
const persistableIconId = normalizedString.max(2_000_000, "iconId inválido.").refine(
  (value) => !isRemoteIconReference(value),
  INVALID_ICON_ID_REFERENCE_MESSAGE,
);

const termInputSchema = z
  .union([
    normalizedString,
    z.array(normalizedString).min(1).max(25),
  ])
  .transform((value) => (Array.isArray(value) ? value : [value]));

export const iconMatchRuleCreateBody = z.object({
  iconId: persistableIconId,
  terms: termInputSchema,
});

export type IconMatchRuleCreateBodyInput = z.infer<typeof iconMatchRuleCreateBody>;
