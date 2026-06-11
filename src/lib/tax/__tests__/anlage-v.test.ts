import { describe, it, expect } from "vitest";
import { calcAfA, calcAnlageV } from "../anlage-v";

const BASE_INPUT = {
  propertyId: "prop1",
  year: 2026,
  purchasePriceTotal: 60000000,  // 600.000 €
  purchasePriceLand:  15000000,  // 150.000 €
  depreciationPermille: 20,      // 2,0 %
  payments: [],
  loanPayments: [],
  expenses: [],
};

describe("calcAfA", () => {
  it("berechnet 2 % vom Gebäudeanteil", () => {
    // Gebäudeanteil = 600.000 - 150.000 = 450.000 €
    // AfA = 450.000 × 2 % = 9.000 €
    expect(calcAfA(60000000, 15000000, 20)).toBe(900000);
  });

  it("gibt 0 zurück wenn kein Anschaffungspreis", () => {
    expect(calcAfA(null, null, 20)).toBe(0);
  });

  it("gibt 0 zurück wenn Gebäudeanteil ≤ 0", () => {
    expect(calcAfA(10000000, 10000000, 20)).toBe(0);
  });

  it("behandelt fehlenden Grundstücksanteil als 0", () => {
    expect(calcAfA(60000000, null, 20)).toBe(1200000); // 600.000 × 2 % = 12.000 €
  });
});

describe("calcAnlageV – Einnahmen", () => {
  it("summiert Ist-Zahlungen die im Jahr eingegangen sind", () => {
    const result = calcAnlageV({
      ...BASE_INPUT,
      payments: [
        { paidCents: 120000, paidAt: "2026-01-05", rentCents: 100000, serviceChargesCents: 20000 },
        { paidCents: 120000, paidAt: "2026-02-03", rentCents: 100000, serviceChargesCents: 20000 },
        { paidCents: 120000, paidAt: "2025-12-31", rentCents: 100000, serviceChargesCents: 20000 }, // Vorjahr → ignoriert
      ],
    });
    expect(result.einnahmen.gesamtCents).toBe(240000); // 2 × 1.200 €
  });

  it("ignoriert unbezahlte Zahlungen", () => {
    const result = calcAnlageV({
      ...BASE_INPUT,
      payments: [
        { paidCents: null, paidAt: null, rentCents: 100000, serviceChargesCents: 20000 },
      ],
    });
    expect(result.einnahmen.gesamtCents).toBe(0);
  });

  it("trennt Kaltmiete und NK korrekt auf", () => {
    const result = calcAnlageV({
      ...BASE_INPUT,
      payments: [
        { paidCents: 120000, paidAt: "2026-01-05", rentCents: 100000, serviceChargesCents: 20000 },
      ],
    });
    expect(result.einnahmen.mieteinnahmenCents).toBe(100000);
    expect(result.einnahmen.umlagenCents).toBe(20000);
  });
});

describe("calcAnlageV – Werbungskosten", () => {
  it("summiert Schuldzinsen aus Darlehensraten des Jahres", () => {
    const result = calcAnlageV({
      ...BASE_INPUT,
      loanPayments: [
        { interestCents: 35941, dueDate: "2026-01-01" },
        { interestCents: 35908, dueDate: "2026-02-01" },
        { interestCents: 35000, dueDate: "2025-12-01" }, // Vorjahr → ignoriert
      ],
    });
    expect(result.werbungskosten.schuldzinsenCents).toBe(71849);
  });

  it("berechnet AfA korrekt", () => {
    const result = calcAnlageV({ ...BASE_INPUT });
    expect(result.werbungskosten.afaCents).toBe(900000); // 9.000 €
  });

  it("summiert Ausgaben nach Kategorie", () => {
    const result = calcAnlageV({
      ...BASE_INPUT,
      expenses: [
        { category: "maintenance",     amountCents: 50000 },
        { category: "maintenance",     amountCents: 30000 },
        { category: "bk_grundsteuer",  amountCents: 40000 },
        { category: "bk_versicherung", amountCents: 25000 },
      ],
    });
    expect(result.werbungskosten.erhaltungsaufwandCents).toBe(80000);
    expect(result.werbungskosten.grundsteuerCents).toBe(40000);
    expect(result.werbungskosten.versicherungenCents).toBe(25000);
  });
});

describe("calcAnlageV – Überschuss", () => {
  it("berechnet Überschuss korrekt", () => {
    const result = calcAnlageV({
      ...BASE_INPUT,
      payments: [
        { paidCents: 120000, paidAt: "2026-01-05", rentCents: 100000, serviceChargesCents: 20000 },
      ],
      expenses: [
        { category: "maintenance", amountCents: 50000 },
      ],
    });
    // Einnahmen: 1.200 €, AfA: 9.000 €, Erhaltungsaufwand: 500 €
    // Überschuss: 1.200 - 9.500 = -8.300 € (Verlust)
    expect(result.ueberschussCents).toBe(120000 - 900000 - 50000);
  });
});
