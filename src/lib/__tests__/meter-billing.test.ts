import { describe, it, expect } from "vitest";
import { billMeters, priceSegments, valueAt, type MeterInput } from "../meter-billing";

const heating: MeterInput = {
  id: "h", name: "Heizung", kind: "meter", purpose: "heating", estimateKwhPerYear: null,
  readings: [{ date: "2026-01-01", value: 1000 }, { date: "2026-06-01", value: 1600 }, { date: "2026-12-31", value: 2300 }],
};

describe("Zählerstände", () => {
  it("exakt oder linear interpoliert, außerhalb null", () => {
    expect(valueAt(heating.readings, "2026-06-01")).toEqual({ value: 1600, interpolated: false });
    const mid = valueAt([{ date: "2026-01-01", value: 0 }, { date: "2026-01-11", value: 100 }], "2026-01-06")!;
    expect(mid).toEqual({ value: 50, interpolated: true });
    expect(valueAt(heating.readings, "2025-12-01")).toBeNull();
  });
});

describe("Preisabschnitte", () => {
  it("teilt am Preiswechsel", () => {
    expect(priceSegments([{ validFrom: "2025-01-01", ctPerKwh: 30 }, { validFrom: "2026-04-01", ctPerKwh: 35 }], "2026-01-01", "2026-06-01")).toEqual([
      { from: "2026-01-01", to: "2026-04-01", ctPerKwh: 30 },
      { from: "2026-04-01", to: "2026-06-01", ctPerKwh: 35 },
    ]);
  });
  it("ohne gültigen Preis → null", () => {
    expect(priceSegments([{ validFrom: "2026-08-01", ctPerKwh: 30 }], "2026-06-01", "2026-09-01")).toBeNull();
  });
});

describe("Abrechnung", () => {
  it("Zähler × Arbeitspreis", () => {
    const r = billMeters([heating], [{ validFrom: "2026-01-01", ctPerKwh: 40 }], "2026-01-01", "2026-06-01");
    expect(r).toMatchObject({ ok: true, kwh: 600, cents: 24_000 });
  });

  it("Preiswechsel mitten im Zeitraum: Verbrauch am Stichtag interpoliert", () => {
    const r = billMeters([heating], [{ validFrom: "2026-01-01", ctPerKwh: 30 }, { validFrom: "2026-03-15", ctPerKwh: 40 }], "2026-01-01", "2026-06-01");
    if (!r.ok) throw new Error(r.error);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]!.interpolated).toBe(true);
    expect(r.kwh).toBe(600); // Summe bleibt exakt
    const v = 1000 + (600 * 73) / 151; // 01.01.→15.03. = 73 von 151 Tagen
    expect(r.lines[0]!.kwh).toBeCloseTo(v - 1000, 2);
    expect(r.cents).toBe(r.lines[0]!.cents + r.lines[1]!.cents);
  });

  it("Schätzung ohne Zähler tageweise", () => {
    const light: MeterInput = { id: "l", name: "Licht", kind: "estimate", purpose: "common", estimateKwhPerYear: 365, readings: [] };
    const r = billMeters([light], [{ validFrom: "2026-01-01", ctPerKwh: 40 }], "2026-03-01", "2026-06-01");
    expect(r).toMatchObject({ ok: true, kwh: 92, cents: 3_680 });
    if (r.ok) expect(r.lines[0]!.estimated).toBe(true);
  });

  it("fehlender Zählerstand oder Preis → verständlicher Fehler", () => {
    expect(billMeters([heating], [{ validFrom: "2025-01-01", ctPerKwh: 40 }], "2025-06-01", "2026-06-01")).toEqual({ ok: false, error: "Heizung: Zählerstand zum 01.06.2025 fehlt." });
    expect(billMeters([heating], [], "2026-01-01", "2026-06-01")).toMatchObject({ ok: false });
    const back: MeterInput = { ...heating, readings: [{ date: "2026-01-01", value: 500 }, { date: "2026-02-01", value: 400 }] };
    expect(billMeters([back], [{ validFrom: "2026-01-01", ctPerKwh: 40 }], "2026-01-01", "2026-02-01")).toMatchObject({ ok: false });
  });
});
