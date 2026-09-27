// Verbrauchsentwicklung je Medium: Mengen, Kosten und Abschläge je Abrechnungszeitraum.
// Reine Funktionen, Beträge in Cents.

import type { ConsumptionMedium } from "@/db/schema";

export const MEDIUM_META: Record<ConsumptionMedium, { label: string; unit: string }> = {
  gas:         { label: "Gas",       unit: "kWh" },
  electricity: { label: "Strom",     unit: "kWh" },
  water:       { label: "Frischwasser", unit: "m³" },
  wastewater:  { label: "Abwasser",  unit: "m³" },
};

export const MEDIA = Object.keys(MEDIUM_META) as ConsumptionMedium[];

export type ConsumptionPeriod = {
  id: string;
  medium: ConsumptionMedium;
  periodStart: string;
  periodEnd: string;
  quantity: number;
  costCents: number | null;
  advanceCents: number | null;
  note: string | null;
};

export type ConsumptionRow = ConsumptionPeriod & {
  label: string;                    // Abrechnungsjahr (Jahr der Zeitraummitte)
  days: number;
  perDay: number;                   // Menge pro Tag
  costPerUnitCents: number | null;  // Kosten je kWh / m³
  balanceCents: number | null;      // Abschläge − Kosten: > 0 Guthaben, < 0 Nachzahlung
  changePct: number | null;         // Veränderung Verbrauch/Tag gegenüber Vorperiode in %
};

export type ConsumptionSeries = {
  medium: ConsumptionMedium;
  label: string;
  unit: string;
  rows: ConsumptionRow[];           // chronologisch
  maxQuantity: number;
};

function toUtc(d: string) {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, day);
}

// Anzahl Tage inkl. Start- und Endtag
export function periodDays(start: string, end: string) {
  return Math.round((toUtc(end) - toUtc(start)) / 86_400_000) + 1;
}

// Abrechnungsjahr = Jahr der Zeitraummitte (z. B. 11.01.2025–10.01.2026 → 2025)
export function periodYearLabel(start: string, end: string) {
  const mid = new Date((toUtc(start) + toUtc(end)) / 2);
  return String(mid.getUTCFullYear());
}

export function buildConsumptionSeries(periods: ConsumptionPeriod[]): ConsumptionSeries[] {
  return MEDIA
    .map((medium) => {
      const sorted = periods
        .filter((p) => p.medium === medium)
        .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
      let prevPerDay: number | null = null;
      const rows = sorted.map((p): ConsumptionRow => {
        const days = Math.max(1, periodDays(p.periodStart, p.periodEnd));
        const perDay = p.quantity / days;
        const changePct = prevPerDay != null && prevPerDay > 0 ? Math.round(((perDay - prevPerDay) / prevPerDay) * 1000) / 10 : null;
        prevPerDay = perDay;
        return {
          ...p,
          label: periodYearLabel(p.periodStart, p.periodEnd),
          days,
          perDay,
          costPerUnitCents: p.costCents != null && p.quantity > 0 ? p.costCents / p.quantity : null,
          balanceCents: p.costCents != null && p.advanceCents != null ? p.advanceCents - p.costCents : null,
          changePct,
        };
      });
      return {
        medium,
        label: MEDIUM_META[medium].label,
        unit: MEDIUM_META[medium].unit,
        rows,
        maxQuantity: Math.max(0, ...rows.map((r) => r.quantity)),
      };
    })
    .filter((s) => s.rows.length > 0);
}
