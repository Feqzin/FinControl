import { z } from "zod";

const fullDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1
      && parsed.getUTCDate() === day;
  }, "Data inválida.");

const durationDaysSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim()) return Number(value);
  return value;
}, z.number().int().min(1).max(90));

const nullableMoneySchema = z.preprocess((value) => {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(",", "."));
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.union([z.number().finite().min(0), z.null()]));

const vacationPlanCommonBody = z.object({
  startDate: fullDateSchema,
  durationDays: durationDaysSchema,
  vacationPayReceived: z.boolean().default(false),
  vacationPayDate: z.union([fullDateSchema, z.null(), z.undefined()]).transform((value) => value ?? null),
  vacationPayAmount: nullableMoneySchema,
  includedInPatrimony: z.boolean().default(false),
});

function validatePatrimonyState(
  value: { includedInPatrimony: boolean; vacationPayReceived: boolean },
  context: z.RefinementCtx,
) {
  if (value.includedInPatrimony && !value.vacationPayReceived) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["includedInPatrimony"],
      message: "O valor só pode constar no patrimônio quando já foi recebido.",
    });
  }
}

export const vacationPlanCreateBody = vacationPlanCommonBody.extend({
  rendaId: z.string().trim().min(1, "Selecione uma renda fixa."),
}).superRefine(validatePatrimonyState);

export const vacationPlansBatchCreateBody = vacationPlanCommonBody.extend({
  rendaIds: z.array(z.string().trim().min(1))
    .min(1, "Selecione pelo menos uma renda fixa.")
    .max(20, "Selecione no máximo 20 rendas fixas.")
    .refine((ids) => new Set(ids).size === ids.length, "Não repita a mesma renda fixa."),
}).superRefine(validatePatrimonyState);

export type VacationPlanCreateBodyInput = z.infer<typeof vacationPlanCreateBody>;
export type VacationPlansBatchCreateBodyInput = z.infer<typeof vacationPlansBatchCreateBody>;
