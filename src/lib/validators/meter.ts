import { z } from "zod";
import { METER_KINDS, METER_PURPOSES, METER_READING_REASONS } from "@/db/schema";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum");
const id = z.string().regex(/^[a-z0-9]{10,40}$/, "Ungültige Auswahl");

export const meterSchema = z
  .object({
    name: z.string().trim().min(1, "Name erforderlich").max(100),
    meterNumber: z.string().trim().max(50).optional(),
    kind: z.enum(METER_KINDS),
    purpose: z.enum(METER_PURPOSES),
    hostUnitId: id,
    unitId: id.nullable(),
    estimateKwhPerYear: z.number().positive().max(100_000).nullable(),
    estimateNote: z.string().trim().max(500).optional(),
    calibrationUntil: date.optional().or(z.literal("")),
    notes: z.string().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.purpose === "unit" && !v.unitId) ctx.addIssue({ code: "custom", path: ["unitId"], message: "Wohnung des Verbrauchers wählen" });
    if (v.purpose === "unit" && v.unitId === v.hostUnitId) ctx.addIssue({ code: "custom", path: ["unitId"], message: "Verbraucher und Stromvertrag sind dieselbe Wohnung" });
    if (v.kind === "estimate" && !v.estimateKwhPerYear) ctx.addIssue({ code: "custom", path: ["estimateKwhPerYear"], message: "Geschätzten Jahresverbrauch angeben" });
  });
export type MeterInput = z.infer<typeof meterSchema>;

export const meterReadingSchema = z.object({
  date,
  value: z.number().min(0).max(100_000_000),
  reason: z.enum(METER_READING_REASONS),
  note: z.string().trim().max(300).optional(),
});
export type MeterReadingInput = z.infer<typeof meterReadingSchema>;

export const supplyPriceSchema = z.object({
  leaseId: id,
  validFrom: date,
  ctPerKwh: z.number().positive("Preis erforderlich").max(200, "Preis in Cent je kWh angeben"),
  note: z.string().trim().max(300).optional(),
});
export type SupplyPriceInput = z.infer<typeof supplyPriceSchema>;

export const settlementSchema = z
  .object({
    direction: z.enum(["refund", "charge"]),
    leaseId: id,
    periodStart: date,
    periodEnd: date,
  })
  .refine((v) => v.periodEnd > v.periodStart, { path: ["periodEnd"], message: "Ende muss nach dem Beginn liegen" });
export type SettlementInput = z.infer<typeof settlementSchema>;
