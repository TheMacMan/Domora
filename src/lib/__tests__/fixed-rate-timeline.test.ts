import { describe, it, expect } from "vitest";
import { buildFixedRateTimeline, balanceAtDate, projectSchedule, type LoanForProjection } from "../loan-projection";

function loan(over: Partial<LoanForProjection & { contractNumber: string | null; interestFixedUntil: string | null }> = {}) {
  return {
    id: "l1",
    description: "Annuität",
    loanType: "annuity",
    balanceCents: 1_000_000, // 10.000 €
    balanceDate: "2026-04-30",
    initialAmountCents: null,
    interestRateBps: 135,
    monthlyPaymentCents: 50_000,
    loanPayments: [],
    property: { street: "Musterweg 1", city: "Musterstadt" },
    replacedByLoanId: null,
    bsTotalSumCents: null, bsSavingsBalanceCents: null, bsSavingsDate: null, bsMonthlySavingsCents: null,
    bsSavingsInterestBps: null, bsMinSavingsPermille: null, bsTargetRatingNumber: null, bsCurrentRatingNumber: null,
    bsLoanInterestBps: null, bsLoanMonthlyPaymentCents: null,
    contractNumber: "123",
    interestFixedUntil: "2026-09-30",
    ...over,
  };
}

describe("balanceAtDate", () => {
  it("nimmt die letzte Rate bis zum Stichtag, sonst den erfassten Stand", () => {
    const l = loan();
    const s = projectSchedule(l);
    const sep = s.find((p) => p.dueDate === "2026-09-01")!;
    expect(balanceAtDate(l, s, "2026-09-30")).toBe(sep.balanceAfterCents);
    expect(balanceAtDate(l, [], "2026-09-30")).toBe(1_000_000);
    expect(balanceAtDate(l, [], "2026-01-01")).toBeNull();
  });
});

describe("buildFixedRateTimeline", () => {
  it("berechnet Restschuld bei Ablauf und stuft kurz bevorstehende Abläufe als dringend ein", () => {
    const [item] = buildFixedRateTimeline([loan()], "2026-09-27");
    expect(item!.status).toBe("urgent");
    expect(item!.monthsLeft).toBe(0);
    expect(item!.balanceAtEndCents).toBeGreaterThan(700_000);
    expect(item!.balanceAtEndCents).toBeLessThan(1_000_000);
  });

  it("unterscheidet abgelaufen, bald und in Ordnung", () => {
    const items = buildFixedRateTimeline([
      loan({ id: "a", interestFixedUntil: "2026-01-31" }),
      loan({ id: "b", interestFixedUntil: "2027-12-31", balanceCents: 10_000_000 }),
      loan({ id: "c", interestFixedUntil: "2035-04-30", balanceCents: 20_000_000, monthlyPaymentCents: 90_000 }),
    ], "2026-09-27");
    expect(items.map((i) => [i.id, i.status])).toEqual([["a", "expired"], ["b", "soon"], ["c", "ok"]]);
  });

  it("erkennt vollständige Tilgung vor Ablauf", () => {
    const [item] = buildFixedRateTimeline([loan({ balanceCents: 200_000, interestFixedUntil: "2030-01-31" })], "2026-09-27");
    expect(item!.status).toBe("paid_off");
    expect(item!.balanceAtEndCents).toBe(0);
    expect(item!.payoffDate! < "2030-01-31").toBe(true);
  });

  it("Darlehen ohne Zinsbindung kommen ans Ende, Bausparverträge entfallen", () => {
    const items = buildFixedRateTimeline([
      loan({ id: "x", interestFixedUntil: null }),
      loan({ id: "y", interestFixedUntil: "2032-03-30", balanceCents: 5_000_000 }),
      loan({ id: "z", loanType: "bauspar", interestFixedUntil: null }),
    ], "2026-09-27");
    expect(items.map((i) => i.id)).toEqual(["y", "x"]);
    expect(items[1]!.status).toBe("unknown");
  });
});
