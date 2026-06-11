import { z } from "zod";

export const propertySchema = z.object({
  street: z.string().min(1, "Straße erforderlich").max(200),
  postalCode: z.string().regex(/^\d{5}$/, "PLZ muss 5 Ziffern haben"),
  city: z.string().min(1, "Ort erforderlich").max(100),
  yearBuilt: z.number().int().min(1800).max(2030).optional(),
  purchaseDate: z.string().optional(),
  purchasePriceTotalEur: z.number().nonnegative().optional(),
  purchasePriceLandEur: z.number().nonnegative().optional(),
  depreciationRate: z.number().positive().max(10),
  // Vergleichsmiete €/m² — optional, frei pflegbar (Mietspiegel, Immo-Portal)
  referenceRentEurPerSqm: z.number().positive().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export type PropertyFormInput = z.infer<typeof propertySchema>;
