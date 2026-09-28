import { z } from "zod";
import { ODOMETER_KINDS, VEHICLE_COST_CATEGORIES, VEHICLE_FUEL_TYPES, VEHICLE_OWNERSHIP, VEHICLE_RATE_METHODS } from "@/db/schema";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datum");
const dateOpt = date.optional().or(z.literal(""));
const id = z.string().regex(/^[a-z0-9]{10,40}$/, "Ungültige Auswahl");

export const vehicleSchema = z
  .object({
    name: z.string().trim().min(1, "Name erforderlich").max(100),
    plate: z.string().trim().max(20).optional(),
    fuelType: z.enum(VEHICLE_FUEL_TYPES),
    ownership: z.enum(VEHICLE_OWNERSHIP),
    inUseFrom: date,
    inUseTo: dateOpt,
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => !v.inUseTo || v.inUseTo >= v.inUseFrom, { path: ["inUseTo"], message: "Ende vor Beginn" });
export type VehicleInput = z.infer<typeof vehicleSchema>;

export const odometerSchema = z.object({
  date,
  km: z.number().int().min(0).max(2_000_000),
  kind: z.enum(ODOMETER_KINDS),
  note: z.string().max(500).optional(),
});
export type OdometerInput = z.infer<typeof odometerSchema>;

export const vehicleCostSchema = z
  .object({
    date,
    category: z.enum(VEHICLE_COST_CATEGORIES),
    amountEur: z.number().refine((n) => n !== 0, "Betrag erforderlich"),
    description: z.string().trim().max(300).optional(),
    servicePeriodStart: dateOpt,
    servicePeriodEnd: dateOpt,
    notes: z.string().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    if (!!v.servicePeriodStart !== !!v.servicePeriodEnd) ctx.addIssue({ code: "custom", path: ["servicePeriodEnd"], message: "Beide Datumsangaben oder keine" });
    if (v.servicePeriodStart && v.servicePeriodEnd && v.servicePeriodStart > v.servicePeriodEnd) ctx.addIssue({ code: "custom", path: ["servicePeriodEnd"], message: "Ende vor Beginn" });
  });
export type VehicleCostInput = z.infer<typeof vehicleCostSchema>;

export const vehicleYearSchema = z.object({
  method: z.enum(VEHICLE_RATE_METHODS),
  estimatedKm: z.number().int().min(1).max(500_000).nullable(),
});

export const tripSchema = z.object({
  vehicleId: id,
  propertyId: id,
  date,
  route: z.string().trim().min(1, "Strecke erforderlich").max(300),
  km: z.number().positive("km erforderlich").max(5_000),
  purpose: z.string().trim().min(1, "Anlass erforderlich").max(300),
});
export type TripInput = z.infer<typeof tripSchema>;

export const tripRouteSchema = z.object({
  name: z.string().trim().min(1).max(100),
  route: z.string().trim().min(1).max(300),
  km: z.number().positive().max(5_000),
  propertyId: id.nullable(),
});
export type TripRouteInput = z.infer<typeof tripRouteSchema>;
