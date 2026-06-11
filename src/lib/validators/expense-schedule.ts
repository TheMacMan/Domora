import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/db/schema";

const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthOpt = z.string().regex(monthRegex, "Format YYYY-MM").optional().or(z.literal(""));

export const expenseScheduleSchema = z
  .object({
    propertyId: z.string().min(1).nullable(),
    category: z.enum(EXPENSE_CATEGORIES),
    amountEur: z.number({ required_error: "Betrag erforderlich" }).positive("Betrag muss positiv sein"),
    description: z.string().max(500).optional(),
    startMonth: z.string().regex(monthRegex, "Format YYYY-MM"),
    endMonth: monthOpt,
    dayOfMonth: z
      .number({ invalid_type_error: "Zahl 1–28" })
      .int()
      .min(1, "Tag 1–28")
      .max(28, "Tag 1–28"),
    notes: z.string().max(2000).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.endMonth && d.endMonth < d.startMonth) {
      ctx.addIssue({ code: "custom", path: ["endMonth"], message: "Ende vor Beginn" });
    }
  });

export type ExpenseScheduleFormInput = z.infer<typeof expenseScheduleSchema>;
