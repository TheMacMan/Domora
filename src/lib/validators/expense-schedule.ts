import { z } from "zod";
import { EXPENSE_CATEGORIES } from "@/db/schema";
import { duplicateMonths, parseDueDates } from "@/lib/schedule-dates";

const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthOpt = z.string().regex(monthRegex, "Format YYYY-MM").optional().or(z.literal(""));

export const SCHEDULE_KINDS = ["monthly", "plan"] as const;

export const expenseScheduleSchema = z
  .object({
    kind: z.enum(SCHEDULE_KINDS),
    propertyId: z.string().min(1).nullable(),
    category: z.enum(EXPENSE_CATEGORIES),
    amountEur: z.number({ required_error: "Betrag erforderlich" }).positive("Betrag muss positiv sein"),
    description: z.string().max(500).optional(),
    // monatlich
    startMonth: z.string().regex(monthRegex, "Format YYYY-MM").optional().or(z.literal("")),
    endMonth: monthOpt,
    dayOfMonth: z
      .number({ invalid_type_error: "Zahl 1–28" })
      .int()
      .min(1, "Tag 1–28")
      .max(28, "Tag 1–28")
      .optional(),
    // Abschlagsplan: Termine als Text („01.03.2026, 01.06.2026 …")
    dueDatesText: z.string().max(1000).optional(),
    serviceYear: z.number({ invalid_type_error: "Jahr" }).int().min(2000).max(2100).optional().or(z.nan()),
    notes: z.string().max(2000).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.kind === "monthly") {
      if (!d.startMonth) ctx.addIssue({ code: "custom", path: ["startMonth"], message: "Startmonat fehlt" });
      if (d.dayOfMonth == null) ctx.addIssue({ code: "custom", path: ["dayOfMonth"], message: "Tag 1–28" });
      if (d.startMonth && d.endMonth && d.endMonth < d.startMonth) {
        ctx.addIssue({ code: "custom", path: ["endMonth"], message: "Ende vor Beginn" });
      }
      return;
    }
    const { dates, invalid } = parseDueDates(d.dueDatesText ?? "");
    if (invalid.length > 0) {
      ctx.addIssue({ code: "custom", path: ["dueDatesText"], message: `Kein Datum: ${invalid.join(", ")}` });
    } else if (dates.length === 0) {
      ctx.addIssue({ code: "custom", path: ["dueDatesText"], message: "Mindestens einen Termin angeben" });
    } else if (dates.length > 24) {
      ctx.addIssue({ code: "custom", path: ["dueDatesText"], message: "Höchstens 24 Termine" });
    } else {
      const dup = duplicateMonths(dates);
      if (dup.length > 0) {
        ctx.addIssue({ code: "custom", path: ["dueDatesText"], message: `Nur ein Termin je Monat (${dup.join(", ")})` });
      }
    }
  });

export type ExpenseScheduleFormInput = z.infer<typeof expenseScheduleSchema>;
