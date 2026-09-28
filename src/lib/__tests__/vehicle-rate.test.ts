import { describe, it, expect } from "vitest";
import { allocateCost, computeVehicleYear, readingNear, tripAmountCents, frequentDestinations, type VehicleYearInput } from "../vehicle-rate";

const cost = (over: Partial<VehicleYearInput["costs"][number]>) => ({
  id: "c", date: "2025-03-01", category: "leasing", amountCents: 94_020, servicePeriodStart: null, servicePeriodEnd: null, ...over,
});

const base = (over: Partial<VehicleYearInput> = {}): VehicleYearInput => ({
  year: 2025,
  vehicle: { inUseFrom: "2024-06-01", inUseTo: null },
  method: "actual",
  estimatedKm: 14_000,
  costs: [
    ...Array.from({ length: 12 }, (_, i) => cost({ id: `l${i}`, date: `2025-${String(i + 1).padStart(2, "0")}-01` })),
    cost({ id: "ins", category: "insurance", amountCents: 147_186, date: "2025-01-01" }),
    cost({ id: "t1", category: "tires", amountCents: 80_419, date: "2025-04-10" }),
    cost({ id: "t2", category: "tires", amountCents: 66_000, date: "2025-09-19" }),
    cost({ id: "e", category: "energy", amountCents: 105, date: "2025-07-01" }),
  ],
  odometer: [],
  ...over,
});

describe("Kostenverteilung", () => {
  it("ohne Zeitraum: voll, wenn das Datum im Abschnitt liegt", () => {
    expect(allocateCost(cost({ date: "2025-05-01" }), "2025-01-01", "2025-12-31")).toBe(94_020);
    expect(allocateCost(cost({ date: "2024-12-31" }), "2025-01-01", "2025-12-31")).toBe(0);
  });
  it("mit Zeitraum: tageweise anteilig (Sonderzahlung über 3 Jahre)", () => {
    const c = cost({ amountCents: 365_000, servicePeriodStart: "2024-01-01", servicePeriodEnd: "2026-12-31" });
    // 365 von 1096 Tagen
    expect(allocateCost(c, "2025-01-01", "2025-12-31")).toBe(Math.round((365_000 * 365) / 1096));
  });
});

describe("km-Satz", () => {
  it("vorläufig mit geschätzten km, solange km-Stände fehlen (Stand 2025: 1,0157 €/km)", () => {
    const r = computeVehicleYear(base());
    expect(r.costCents).toBe(1_421_950);
    expect(r.provisional).toBe(true);
    expect(r.basisKm).toBe(14_000);
    expect(r.rateCentsPerKm!).toBeCloseTo(101.568, 3);
    expect(tripAmountCents(72.2, r)).toBe(7_333);
  });

  it("aus km-Ständen zu Jahresbeginn und -ende (31.12. Vorjahr zählt als Beginn)", () => {
    const r = computeVehicleYear(base({ odometer: [{ date: "2024-12-31", km: 20_000 }, { date: "2026-01-02", km: 36_000 }] }));
    expect(r.provisional).toBe(false);
    expect(r.drivenKm).toBe(16_000);
    expect(tripAmountCents(72.2, r)).toBe(Math.round((72.2 * 1_421_950) / 16_000));
  });

  it("Fahrzeugwechsel im Jahr: nur Abschnitt und Kosten der Nutzung", () => {
    const r = computeVehicleYear(base({
      vehicle: { inUseFrom: "2023-01-01", inUseTo: "2025-06-30" },
      odometer: [{ date: "2025-01-01", km: 50_000 }, { date: "2025-06-30", km: 57_000 }],
    }));
    expect(r.segmentEnd).toBe("2025-06-30");
    expect(r.drivenKm).toBe(7_000);
    // 6 Leasingraten + Versicherung + Reifen April
    expect(r.costCents).toBe(6 * 94_020 + 147_186 + 80_419);
  });

  it("nicht im Jahr genutzt → inaktiv, keine Kosten", () => {
    const r = computeVehicleYear(base({ vehicle: { inUseFrom: "2026-02-01", inUseTo: null } }));
    expect(r.active).toBe(false);
    expect(r.costCents).toBe(0);
  });

  it("Pauschale 0,30 €/km, unabhängig von km-Ständen", () => {
    const r = computeVehicleYear(base({ method: "flat" }));
    expect(r.provisional).toBe(false);
    expect(tripAmountCents(72.2, r)).toBe(2_166);
  });

  it("ohne km-Stand und ohne Schätzung kein Betrag", () => {
    const r = computeVehicleYear(base({ estimatedKm: null }));
    expect(r.rateCentsPerKm).toBeNull();
    expect(tripAmountCents(10, r)).toBeNull();
  });

  it("km-Stand nur innerhalb der Toleranz", () => {
    expect(readingNear([{ date: "2025-01-20", km: 1 }], "2025-01-01")).toBeNull();
    expect(readingNear([{ date: "2025-01-10", km: 1 }, { date: "2024-12-30", km: 2 }], "2025-01-01")!.km).toBe(2);
  });
});

describe("häufige Ziele", () => {
  it("meldet Objekte ab 60 Fahrten im Jahr", () => {
    const list = [
      ...Array.from({ length: 60 }, () => ({ propertyId: "a", date: "2025-05-01" })),
      ...Array.from({ length: 59 }, () => ({ propertyId: "b", date: "2025-05-01" })),
    ];
    expect(frequentDestinations(list)).toEqual([{ propertyId: "a", year: 2025, count: 60 }]);
  });
});
