import { describe, it, expect } from "vitest";
import { aggregateReceipts, buildRentLedger } from "../receipts";

describe("aggregateReceipts", () => {
  it("ohne Eingänge: nicht bezahlt (null/null)", () => {
    expect(aggregateReceipts([])).toEqual({ paidCents: null, paidAt: null });
  });

  it("summiert Eingänge und nimmt das jüngste Datum", () => {
    expect(
      aggregateReceipts([
        { receivedAt: "2025-08-20", amountCents: 20000 },
        { receivedAt: "2025-08-22", amountCents: 10000 },
        { receivedAt: "2025-08-19", amountCents: 25500 },
      ]),
    ).toEqual({ paidCents: 55500, paidAt: "2025-08-22" });
  });

  it("berücksichtigt Rückzahlungen (negative Eingänge)", () => {
    expect(
      aggregateReceipts([
        { receivedAt: "2020-11-03", amountCents: 45000 },
        { receivedAt: "2020-11-03", amountCents: 45000 },
        { receivedAt: "2020-11-05", amountCents: -45000 },
      ]),
    ).toEqual({ paidCents: 45000, paidAt: "2020-11-05" });
  });
});

describe("buildRentLedger", () => {
  const payments = [
    { id: "p1", dueDate: "2025-01-01", rentCents: 35000, serviceChargesCents: 20000 },
    { id: "p2", dueDate: "2025-02-01", rentCents: 35000, serviceChargesCents: 20000 },
    { id: "p3", dueDate: "2025-03-01", rentCents: 35000, serviceChargesCents: 20000 }, // noch nicht fällig
  ];

  it("berechnet Soll bis Stichtag, Eingänge und Rückstand", () => {
    const l = buildRentLedger({
      payments,
      receipts: [
        { paymentId: "p1", receivedAt: "2025-01-03", amountCents: 55000, note: null },
        { paymentId: "p2", receivedAt: "2025-02-10", amountCents: 30000, note: "Teil" },
      ],
      asOf: "2025-02-28",
    });
    expect(l.totalSollCents).toBe(110000);
    expect(l.totalReceivedCents).toBe(85000);
    expect(l.balanceCents).toBe(-25000);
    expect(l.currentMonthlySollCents).toBe(55000);
    expect(l.entries.map((e) => [e.type, e.date, e.balanceCents])).toEqual([
      ["soll", "2025-01-01", -55000],
      ["receipt", "2025-01-03", 0],
      ["soll", "2025-02-01", -55000],
      ["receipt", "2025-02-10", -25000],
    ]);
  });

  it("ordnet am selben Tag zuerst die Soll-Buchung ein", () => {
    const l = buildRentLedger({
      payments: [payments[0]!],
      receipts: [{ paymentId: "p1", receivedAt: "2025-01-01", amountCents: 55000, note: null }],
      asOf: "2025-01-31",
    });
    expect(l.entries[0]!.type).toBe("soll");
    expect(l.entries[1]!.balanceCents).toBe(0);
  });

  it("Guthaben bei Vorauszahlung ist positiv", () => {
    const l = buildRentLedger({
      payments: [payments[0]!],
      receipts: [{ paymentId: "p1", receivedAt: "2024-12-30", amountCents: 60000, note: null }],
      asOf: "2025-01-31",
    });
    expect(l.balanceCents).toBe(5000);
  });
});
