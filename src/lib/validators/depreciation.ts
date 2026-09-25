import { z } from "zod";

// AfA-Posten wie ELSTER Anlage V, Zeile 33
export const depreciationItemSchema = z
  .object({
    method: z.enum(["linear", "degressive"]),
    ratePercent: z.number().positive("Prozent muss > 0 sein").max(100).optional(),
    basisMode: z.enum(["prior_year", "explanation"]),
    explanation: z.string().max(2000).optional(),
    annualEur: z.number({ required_error: "Betrag erforderlich" }).nonnegative(),
    fromYear: z.number().int().min(1900).max(2100).optional(),
    toYear: z.number().int().min(1900).max(2100).optional(),
  })
  .refine((d) => d.fromYear == null || d.toYear == null || d.fromYear <= d.toYear, {
    message: "„Bis Jahr“ darf nicht vor „Ab Jahr“ liegen",
    path: ["toYear"],
  });

export type DepreciationItemInput = z.infer<typeof depreciationItemSchema>;
