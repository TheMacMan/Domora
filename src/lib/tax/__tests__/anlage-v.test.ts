import { describe, it, expect } from "vitest";
import { calcAfA, calcAnlageV, buildLoanInterestPayments, receiptsToAnlageVPayments } from "../anlage-v";

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

describe("receiptsToAnlageVPayments (Zuflussprinzip)", () => {
  const monat = { rentCents: 35000, serviceChargesCents: 20000 }; // 550 € Soll

  it("Teilzahlungen über den Jahreswechsel zählen jeweils im Jahr ihres Eingangs", () => {
    const receipts = [
      { kind: "rent" as const, amountCents: 30000, receivedAt: "2024-12-31", payment: monat },
      { kind: "rent" as const, amountCents: 25000, receivedAt: "2025-03-03", payment: monat },
    ];
    const pays = receiptsToAnlageVPayments(receipts);
    const y2024 = calcAnlageV({ ...BASE_INPUT, year: 2024, payments: pays });
    const y2025 = calcAnlageV({ ...BASE_INPUT, year: 2025, payments: pays });
    expect(y2024.einnahmen.gesamtCents).toBe(30000);
    expect(y2025.einnahmen.gesamtCents).toBe(25000);
  });

  it("teilt einen Mieteingang im Verhältnis Kalt/NK des Monats-Solls auf", () => {
    const pays = receiptsToAnlageVPayments([
      { kind: "rent", amountCents: 55000, receivedAt: "2025-05-02", payment: monat },
    ]);
    const res = calcAnlageV({ ...BASE_INPUT, year: 2025, payments: pays });
    expect(res.einnahmen.mieteinnahmenCents).toBe(35000);
    expect(res.einnahmen.umlagenCents).toBe(20000);
  });

  it("Rückzahlung an den Mieter mindert die Einnahmen im Jahr der Rückzahlung", () => {
    const pays = receiptsToAnlageVPayments([
      { kind: "rent", amountCents: 55000, receivedAt: "2023-04-12", payment: monat },
      { kind: "rent", amountCents: -55000, receivedAt: "2023-04-13", payment: monat },
    ]);
    const res = calcAnlageV({ ...BASE_INPUT, year: 2023, payments: pays });
    expect(res.einnahmen.gesamtCents).toBe(0);
  });

  it("NK-Nachzahlung und -Erstattung wirken vollständig auf die Umlagen", () => {
    const pays = receiptsToAnlageVPayments([
      { kind: "nk_settlement", amountCents: 50061, receivedAt: "2025-03-24", payment: null },
      { kind: "nk_settlement", amountCents: -49520, receivedAt: "2025-03-26", payment: null },
    ]);
    const res = calcAnlageV({ ...BASE_INPUT, year: 2025, payments: pays });
    expect(res.einnahmen.mieteinnahmenCents).toBe(0);
    expect(res.einnahmen.umlagenCents).toBe(50061 - 49520);
  });

  it("ignoriert Eingänge über 0 € und Mieteingänge ohne Monat", () => {
    const pays = receiptsToAnlageVPayments([
      { kind: "rent", amountCents: 0, receivedAt: "2025-01-01", payment: monat },
      { kind: "rent", amountCents: 10000, receivedAt: "2025-01-01", payment: null },
    ]);
    expect(pays).toEqual([]);
  });
});

describe("buildLoanInterestPayments (Vorrang Jahres-Zinsbescheinigung)", () => {
  const computed = [
    { interestCents: 10000, dueDate: "2026-01-01" },
    { interestCents: 9000, dueDate: "2026-02-01" },
    { interestCents: 5000, dueDate: "2025-12-01" }, // Vorjahr
  ];

  it("nutzt den manuellen Jahreswert statt der berechneten Zinsen", () => {
    const out = buildLoanInterestPayments(
      [{ loanPayments: computed, manualInterestCents: 22222 }],
      2026,
    );
    // Ein einzelner Jahresposten mit dem manuellen Wert
    expect(out).toEqual([{ interestCents: 22222, dueDate: "2026-01-01" }]);
    // In der Anlage-V-Summe schlägt genau dieser Betrag durch
    const res = calcAnlageV({ ...BASE_INPUT, loanPayments: out });
    expect(res.werbungskosten.schuldzinsenCents).toBe(22222);
  });

  it("fällt ohne manuellen Wert auf die berechneten Monatszinsen zurück", () => {
    const out = buildLoanInterestPayments(
      [{ loanPayments: computed, manualInterestCents: null }],
      2026,
    );
    expect(out).toEqual(computed);
    // calcAnlageV filtert das Vorjahr (2025) heraus → 10000 + 9000
    const res = calcAnlageV({ ...BASE_INPUT, loanPayments: out });
    expect(res.werbungskosten.schuldzinsenCents).toBe(19000);
  });

  it("mischt manuelle und berechnete Darlehen korrekt", () => {
    const out = buildLoanInterestPayments(
      [
        { loanPayments: computed, manualInterestCents: 30000 },
        { loanPayments: [{ interestCents: 4000, dueDate: "2026-03-01" }], manualInterestCents: null },
      ],
      2026,
    );
    const res = calcAnlageV({ ...BASE_INPUT, loanPayments: out });
    expect(res.werbungskosten.schuldzinsenCents).toBe(34000);
  });

  it("manueller Wert 0 zählt als erfasst (nicht Fallback)", () => {
    const out = buildLoanInterestPayments(
      [{ loanPayments: computed, manualInterestCents: 0 }],
      2026,
    );
    expect(out).toEqual([{ interestCents: 0, dueDate: "2026-01-01" }]);
    const res = calcAnlageV({ ...BASE_INPUT, loanPayments: out });
    expect(res.werbungskosten.schuldzinsenCents).toBe(0);
  });
});

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
