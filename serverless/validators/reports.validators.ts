import { differenceInCalendarMonths, parseISO } from "date-fns";
import { z } from "zod";
import { isIsoDateString } from "../../utils/date.js";

const MAX_REPORT_MONTHS = 24;

const isoDateQueryField = z
  .union([z.string(), z.array(z.string()), z.undefined()])
  .transform((value) => {
    if (Array.isArray(value)) return value[0];
    return value;
  })
  .pipe(
    z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD")
      .refine((value) => isIsoDateString(value), "Data inválida")
      .optional(),
  );

export const reportsOverviewQuerySchema = z
  .object({
    startDate: isoDateQueryField,
    endDate: isoDateQueryField,
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate) {
      const start = parseISO(value.startDate);
      const end = parseISO(value.endDate);
      if (end < start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "endDate não pode ser menor que startDate",
          path: ["endDate"],
        });
      }

      const monthsSpan = differenceInCalendarMonths(end, start) + 1;
      if (monthsSpan > MAX_REPORT_MONTHS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Período máximo permitido é de ${MAX_REPORT_MONTHS} meses`,
          path: ["endDate"],
        });
      }
    }
  });

export type ReportsOverviewQueryInput = z.infer<typeof reportsOverviewQuerySchema>;
export { MAX_REPORT_MONTHS };
