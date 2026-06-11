import { z } from "zod";

export const rentAdjustmentSchema = z.object({
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum"),
  rentEur: z.number({ required_error: "Kaltmiete erforderlich" }).positive("Kaltmiete muss positiv sein"),
  serviceChargesEur: z.number().nonnegative().optional(),
  reason: z.string().max(200).optional(),
});

export type RentAdjustmentFormInput = z.infer<typeof rentAdjustmentSchema>;
