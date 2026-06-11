// Hilfsfunktionen für die effektive Miete (Kalt + NK) eines Mietvertrags
// unter Berücksichtigung von Mietanpassungen.
//
// Wichtig: serviceChargesCents kann in einer Anpassung null sein. "null" bedeutet
// "in dieser Anpassung nicht geändert" — der vorherige NK-Wert wird übernommen,
// NICHT direkt der Lease-Wert (sonst werden zwischenzeitliche NK-Änderungen
// ignoriert).

export type RentLike = {
  rentCents: number;
  serviceChargesCents: number | null;
};

export type AdjustmentLike = {
  effectiveDate: string;            // YYYY-MM-DD
  rentCents: number;
  serviceChargesCents: number | null;
};

// Ermittelt die effektive Kalt + NK für einen bestimmten Stichtag (YYYY-MM-DD).
// Walkt rückwärts durch die Anpassungen ≤ asOfDate und nimmt für die NK den
// jeweils letzten nicht-null Wert (oder fällt zurück auf lease.serviceChargesCents).
export function effectiveRentAt(
  lease: RentLike,
  adjustments: AdjustmentLike[],
  asOfDate: string,
): { rentCents: number; serviceChargesCents: number | null } {
  const applicable = adjustments
    .filter((a) => a.effectiveDate <= asOfDate)
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)); // alt → neu

  let rent = lease.rentCents;
  let sc: number | null = lease.serviceChargesCents;

  for (const adj of applicable) {
    rent = adj.rentCents;
    if (adj.serviceChargesCents != null) sc = adj.serviceChargesCents;
  }

  return { rentCents: rent, serviceChargesCents: sc };
}
