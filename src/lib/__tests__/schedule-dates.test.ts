import { describe, it, expect } from "vitest";
import {
  nextBankDay,
  parseDueDates,
  formatDueDates,
  shiftDueDatesOneYear,
  scheduleOccurrences,
  duplicateMonths,
} from "../schedule-dates";

describe("Abschlagsplan-Termine", () => {
  it("verschiebt Wochenenden auf Montag", () => {
    expect(nextBankDay("2026-03-01")).toBe("2026-03-02"); // Sonntag
    expect(nextBankDay("2026-08-01")).toBe("2026-08-03"); // Samstag
    expect(nextBankDay("2026-06-01")).toBe("2026-06-01"); // Montag
    expect(nextBankDay("2025-05-31")).toBe("2025-06-02"); // Samstag → Folgemonat
  });

  it("liest deutsche und ISO-Daten, sortiert, ohne Doppelte", () => {
    expect(parseDueDates("01.11.2026, 1.3.2026; 2026-06-01\n01.03.2026")).toEqual({
      dates: ["2026-03-01", "2026-06-01", "2026-11-01"],
      invalid: [],
    });
    expect(parseDueDates("31.02.2026 foo").invalid).toEqual(["31.02.2026", "foo"]);
  });

  it("formatiert und schiebt ins Folgejahr", () => {
    expect(formatDueDates(["2026-03-01", "2026-11-30"])).toBe("01.03.2026, 30.11.2026");
    expect(shiftDueDatesOneYear(["2026-03-01", "2024-02-29"])).toEqual(["2027-03-01", "2025-02-28"]);
  });

  it("erzeugt Termine für Plan und monatliches Abo", () => {
    const plan = scheduleOccurrences(
      { startMonth: "2026-03", endMonth: "2026-11", dayOfMonth: 1, dueDates: ["2026-03-01", "2026-06-01", "2026-09-01", "2026-11-01"] },
      "2027-09",
    );
    expect(plan.map((o) => o.date)).toEqual(["2026-03-02", "2026-06-01", "2026-09-01", "2026-11-02"]);
    expect(plan[0]!.dueDate).toBe("2026-03-01");
    const monthly = scheduleOccurrences({ startMonth: "2026-11", endMonth: null, dayOfMonth: 3, dueDates: null }, "2027-01");
    expect(monthly.map((o) => o.date)).toEqual(["2026-11-03", "2026-12-03", "2027-01-03"]);
  });

  it("erkennt Termine im selben Buchungsmonat", () => {
    expect(duplicateMonths(["2026-03-01", "2026-03-15", "2026-06-01"])).toEqual(["2026-03"]);
    expect(duplicateMonths(["2026-03-01", "2026-06-01"])).toEqual([]);
  });
});
