import { describe, it, expect } from "vitest";
import { buildDashboardTasks, type TaskInput } from "../dashboard-tasks";
import type { FixedRateItem } from "../loan-projection";

const fixed = (over: Partial<FixedRateItem>): FixedRateItem => ({
  id: "l1", description: "Restschuld", contractNumber: "6766166513", property: "Musterweg 1",
  fixedUntil: "2026-09-30", monthsLeft: 0, balanceAtEndCents: 739_426, payoffDate: null,
  interestRateBps: 135, status: "urgent", ...over,
});

const base: TaskInput = {
  today: "2026-09-27",
  fixedRates: [],
  missingDues: [],
  arrears: [],
  endingLeases: [],
  missingNkStatements: [],
};

describe("buildDashboardTasks", () => {
  it("ohne Anlass keine Aufgaben", () => {
    expect(buildDashboardTasks(base)).toEqual([]);
  });

  it("Zinsbindung in 3 Tagen ist dringend, in 5 Monaten eine Warnung, später keine Aufgabe", () => {
    const t = buildDashboardTasks({
      ...base,
      fixedRates: [
        fixed({ id: "a" }),
        fixed({ id: "b", fixedUntil: "2027-02-28", monthsLeft: 5 }),
        fixed({ id: "c", fixedUntil: "2032-03-30", monthsLeft: 66, status: "ok" }),
      ],
    });
    expect(t.map((x) => [x.id, x.severity])).toEqual([["fixed-a", "urgent"], ["fixed-b", "warning"]]);
    expect(t[0]!.title).toContain("in 3 Tagen");
    expect(t[0]!.amountCents).toBe(739_426);
  });

  it("fasst fehlende Soll-Stellungen zusammen und verlinkt den frühesten Monat", () => {
    const [t] = buildDashboardTasks({
      ...base,
      missingDues: [
        { leaseId: "x", label: "A", months: ["2026-09"] },
        { leaseId: "y", label: "B", months: ["2026-08", "2026-09"] },
      ],
    });
    expect(t!.title).toBe("Mieten für 2 Monate noch nicht erzeugt");
    expect(t!.href).toBe("/payments?month=2026-08");
    expect(t!.detail).toContain("2 Verträge");
  });

  it("Rückstände nur bei positivem Betrag", () => {
    const t = buildDashboardTasks({
      ...base,
      arrears: [
        { leaseId: "x", label: "Antic Bakal", cents: 35_000, year: 2026 },
        { leaseId: "y", label: "Schäfer", cents: 0, year: 2026 },
      ],
    });
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ severity: "warning", amountCents: 35_000, href: "/payments/overview?year=2026" });
  });

  it("NK-Abrechnung: dringend in den letzten 3 Monaten vor Fristende, Hinweis nach Ablauf", () => {
    const t = buildDashboardTasks({
      ...base,
      today: "2026-10-15",
      missingNkStatements: [
        { propertyId: "p", label: "In den Gärten 16", year: 2025 },
        { propertyId: "p", label: "In den Gärten 16", year: 2024 },
      ],
    });
    const byId = Object.fromEntries(t.map((x) => [x.id, x]));
    expect(byId["nk-p-2025"]!.severity).toBe("urgent");
    expect(byId["nk-p-2025"]!.detail).toContain("31.12.2026");
    expect(byId["nk-p-2024"]!.title).toContain("Frist abgelaufen");
  });

  it("Vertragsende nur innerhalb von 60 Tagen", () => {
    const t = buildDashboardTasks({
      ...base,
      endingLeases: [
        { leaseId: "a", label: "Graichen", endDate: "2026-10-31" },
        { leaseId: "b", label: "Später", endDate: "2027-03-31" },
        { leaseId: "c", label: "Vorbei", endDate: "2026-05-31" },
      ],
    });
    expect(t.map((x) => x.id)).toEqual(["ending-a"]);
    expect(t[0]!.title).toContain("in 34 Tagen");
  });

  it("sortiert dringend vor Warnung vor Hinweis", () => {
    const t = buildDashboardTasks({
      ...base,
      endingLeases: [{ leaseId: "a", label: "X", endDate: "2026-10-01" }],
      arrears: [{ leaseId: "x", label: "Y", cents: 100, year: 2026 }],
      fixedRates: [fixed({})],
    });
    expect(t.map((x) => x.severity)).toEqual(["urgent", "warning", "info"]);
  });
});
