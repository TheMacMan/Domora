import { OPERATING_COST_CATEGORIES, type ExpenseCategory } from "@/lib/expense";
import type { NkDistributionKey } from "@/db/schema";

// Default-Verteilerschlüssel pro Kategorie (User kann pro Position übersteuern).
export const DEFAULT_DISTRIBUTION_KEY: Record<ExpenseCategory, NkDistributionKey> = {
  // Umlegbare Betriebskosten
  bk_grundsteuer:      "area",
  bk_wasser:           "area",
  bk_abwasser:         "area",
  bk_heizung:          "area",      // vereinfacht; Phase 2: 50–70 % Verbrauch + Rest Fläche
  bk_warmwasser:       "area",
  bk_aufzug:           "area",
  bk_strasse_muell:    "area",
  bk_hausreinigung:    "area",
  bk_gartenpflege:     "area",
  bk_beleuchtung:      "area",
  bk_schornsteinfeger: "area",
  bk_versicherung:     "area",
  bk_hauswart:         "area",
  bk_antenne_kabel:    "units",
  bk_waschkueche:      "consumption",
  bk_sonstige:         "area",
  // Nicht umlegbar: stehen in NK-Abrechnung gar nicht zur Verfügung
  maintenance:         "area",
  capital_expense:     "area",
  administration:      "area",
  insurance_owner:     "area",
  non_allocable_other: "area",
  other:               "area",
  // WEG-Sammelkategorien (nicht NK-relevant, daher beliebig)
  weg_hausgeld:        "area",
  weg_saldo:           "area",
  weg_ruecklage:       "area",
};

export const DISTRIBUTION_LABELS: Record<NkDistributionKey, string> = {
  area:        "Wohnfläche",
  units:       "Wohneinheiten",
  consumption: "Verbrauch",
  mix:         "Mix (Verbrauch + Fläche)",
};

// Default Mix-Anteil Verbrauch in Promille (700 = 70 %).
// HeizkostenV verlangt mindestens 50 %, üblich sind 70 %.
export const DEFAULT_MIX_CONSUMPTION_PERMILLE = 700;

// Berechnet, in wie vielen Monaten des Jahres ein Lease am 1. des Monats aktiv war.
export function monthsActiveInYear(
  lease: { startDate: string; endDate: string | null },
  year: number,
): number {
  let count = 0;
  for (let m = 1; m <= 12; m++) {
    const monthStart = `${year}-${String(m).padStart(2, "0")}-01`;
    if (lease.startDate <= monthStart && (lease.endDate == null || lease.endDate >= monthStart)) {
      count++;
    }
  }
  return count;
}

// Cents proportional aufteilen ohne Rundungsverlust (letzter bekommt den Rest).
export function splitProportional(totalCents: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) return weights.map(() => 0);
  const result = weights.map((w) => Math.round((w / totalWeight) * totalCents));
  // Rundungsdifferenz auf den größten Anteil legen
  const diff = totalCents - result.reduce((s, x) => s + x, 0);
  if (diff !== 0) {
    const maxIdx = result.indexOf(Math.max(...result));
    result[maxIdx] = (result[maxIdx] ?? 0) + diff;
  }
  return result;
}

export function isOperatingCategory(cat: string): cat is ExpenseCategory {
  return (OPERATING_COST_CATEGORIES as string[]).includes(cat);
}
