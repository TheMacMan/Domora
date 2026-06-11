import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/db/schema";

const dateOpt = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum").optional().or(z.literal(""));

export const expenseSchema = z
  .object({
    propertyId: z.string().min(1).nullable(),
    category: z.enum(EXPENSE_CATEGORIES),
    amountEur: z.number({ required_error: "Betrag erforderlich" }).positive("Betrag muss positiv sein"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum"),
    description: z.string().max(500).optional(),
    isRecurring: z.boolean(),
    servicePeriodStart: dateOpt,
    servicePeriodEnd: dateOpt,
    notes: z.string().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    const start = data.servicePeriodStart;
    const end = data.servicePeriodEnd;
    if ((start && !end) || (!start && end)) {
      ctx.addIssue({ code: "custom", path: ["servicePeriodEnd"], message: "Beide Datumsangaben oder keine" });
    }
    if (start && end && start > end) {
      ctx.addIssue({ code: "custom", path: ["servicePeriodEnd"], message: "Ende vor Beginn" });
    }
  });

export type ExpenseFormInput = z.infer<typeof expenseSchema>;
