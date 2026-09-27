import { describe, it, expect } from "vitest";
import { buildConsumptionSeries, periodDays, periodYearLabel, type ConsumptionPeriod } from "../consumption";

const p = (over: Partial<ConsumptionPeriod>): ConsumptionPeriod => ({
  id: "x", medium: "wastewater", periodStart: "2024-01-01", periodEnd: "2024-12-31",
  quantity: 488, costCents: null, advanceCents: null, note: null, ...over,
});

describe("Zeitraum", () => {
  it("zählt Tage inklusive Start und Ende", () => {
    expect(periodDays("2024-01-01", "2024-12-31")).toBe(366);
    expect(periodDays("2025-01-11", "2026-01-10")).toBe(365);
  });
  it("ordnet einen verschobenen Zeitraum dem Jahr seiner Mitte zu", () => {
    expect(periodYearLabel("2025-01-11", "2026-01-10")).toBe("2025");
    expect(periodYearLabel("2024-01-01", "2025-01-10")).toBe("2024");
  });
});

describe("buildConsumptionSeries", () => {
  const series = buildConsumptionSeries([
    p({ id: "b", periodStart: "2024-01-01", periodEnd: "2024-12-31", quantity: 488, costCents: 196_457, advanceCents: 304_800 }),
    p({ id: "a", periodStart: "2023-01-01", periodEnd: "2023-12-31", quantity: 987 }),
    p({ id: "g", medium: "gas", periodStart: "2025-01-11", periodEnd: "2026-01-10", quantity: 50_882, costCents: 459_622, advanceCents: 524_700 }),
  ]);

  it("gruppiert je Medium in fester Reihenfolge und sortiert chronologisch", () => {
    expect(series.map((s) => s.medium)).toEqual(["gas", "wastewater"]); // feste Reihenfolge laut MEDIA
    expect(series[1]!.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(series[1]!.maxQuantity).toBe(987);
  });

  it("berechnet Veränderung je Tag, Kosten je Einheit und Guthaben", () => {
    const b = series[1]!.rows[1]!;
    // 488/366 gegenüber 987/365 → rund −50,7 %
    expect(b.changePct).toBeCloseTo(-50.7, 1);
    expect(b.costPerUnitCents).toBeCloseTo(402.6, 1);
    expect(b.balanceCents).toBe(304_800 - 196_457); // Guthaben
    expect(series[1]!.rows[0]!.changePct).toBeNull();
    expect(series[1]!.rows[0]!.balanceCents).toBeNull();
  });

  it("negatives Saldo bedeutet Nachzahlung", () => {
    const [s] = buildConsumptionSeries([p({ costCents: 100_000, advanceCents: 80_000 })]);
    expect(s!.rows[0]!.balanceCents).toBe(-20_000);
  });

  it("ohne Daten keine Serie", () => {
    expect(buildConsumptionSeries([])).toEqual([]);
  });
});
