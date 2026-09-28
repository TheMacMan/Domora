// Beschriftungen für Fahrzeuge und Fahrzeugkosten
import type { VehicleCostCategory } from "@/db/schema";

export const VEHICLE_COST_LABELS: Record<VehicleCostCategory, string> = {
  leasing: "Leasingrate",
  leasing_special: "Leasing-Sonderzahlung",
  depreciation: "Abschreibung (AfA)",
  insurance: "Versicherung",
  tax: "Kfz-Steuer",
  energy: "Kraftstoff / Laden unterwegs",
  maintenance: "Wartung & Reparatur",
  tires: "Reifen",
  other: "Sonstiges (TÜV, Wäsche …)",
};

export const FUEL_LABELS = { combustion: "Verbrenner", electric: "Elektro", hybrid: "Hybrid" } as const;
export const OWNERSHIP_LABELS = { lease: "Leasing", purchase: "Kauf", financed: "Finanzierung" } as const;
export const ODOMETER_LABELS = {
  year_start: "Jahresbeginn",
  year_end: "Jahresende",
  handover: "Übernahme",
  return: "Rückgabe",
  other: "sonstiger",
} as const;

export function formatKm(km: number): string {
  return km.toLocaleString("de-DE", { maximumFractionDigits: 1 });
}
