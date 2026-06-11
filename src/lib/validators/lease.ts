import { z } from "zod";

export const RENT_COMPONENT_KINDS = ["garage", "parking", "kitchen", "furniture", "other"] as const;
export type RentComponentKind = (typeof RENT_COMPONENT_KINDS)[number];

export const RENT_COMPONENT_LABELS: Record<RentComponentKind, string> = {
  garage: "Garage",
  parking: "Stellplatz",
  kitchen: "Küche / Möblierung",
  furniture: "Möbel",
  other: "Sonstiges",
};

export const rentComponentSchema = z.object({
  kind: z.enum(RENT_COMPONENT_KINDS),
  description: z.string().max(200).optional().or(z.literal("")),
  amountEur: z.number({ required_error: "Betrag erforderlich" }).positive("Betrag muss positiv sein"),
});

export type RentComponentInput = z.infer<typeof rentComponentSchema>;

export const leaseSchema = z.object({
  unitId: z.string().min(1, "Wohneinheit erforderlich"),
  tenantIds: z.array(z.string()).min(1, "Mind. ein Mieter erforderlich"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  rentEur: z.number({ required_error: "Kaltmiete erforderlich" }).positive("Kaltmiete muss positiv sein"),
  serviceChargesEur: z.number().nonnegative().optional(),
  depositMode: z.enum(["fixed", "factor"]).optional(),
  depositEur: z.number().nonnegative().optional(),
  depositFactor: z.number().positive().max(6, "Faktor max. 6").optional(),
  rentType: z.enum(["fixed", "index", "graduated"]),
  rentComponents: z.array(rentComponentSchema).optional(),
  notes: z.string().max(2000).optional(),
});

export type LeaseFormInput = z.infer<typeof leaseSchema>;
