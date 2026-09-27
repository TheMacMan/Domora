import { z } from "zod";
import { CONSUMPTION_MEDIA } from "@/db/schema";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT");

export const consumptionPeriodSchema = z
  .object({
    medium: z.enum(CONSUMPTION_MEDIA),
    periodStart: isoDate,
    periodEnd: isoDate,
    quantity: z.number({ required_error: "Verbrauch erforderlich" }).nonnegative("Verbrauch darf nicht negativ sein").max(10_000_000),
    costEur: z.number().min(-1_000_000).max(1_000_000).optional(),
    advanceEur: z.number().min(-1_000_000).max(1_000_000).optional(),
    note: z.string().max(500).optional(),
  })
  .refine((d) => d.periodStart <= d.periodEnd, { message: "Das Ende darf nicht vor dem Beginn liegen", path: ["periodEnd"] });

export type ConsumptionPeriodInput = z.infer<typeof consumptionPeriodSchema>;
