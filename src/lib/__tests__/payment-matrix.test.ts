import { describe, it, expect } from "vitest";
import { buildMatrixRow, cellStatus, leaseActiveInMonth } from "../payment-matrix";

const pay = (month: number, paid: number | null, soll = 55_500) => ({
  id: `p${month}`,
  dueDate: `2025-${String(month).padStart(2, "0")}-01`,
  rentCents: soll - 21_500,
  serviceChargesCents: 21_500,
  paidCents: paid,
});

describe("leaseActiveInMonth", () => {
  const lease = { startDate: "2025-03-15", endDate: "2025-08-31" };
  it("aktiv ab dem Monat des Beginns bis zum Monat des Endes", () => {
    expect(leaseActiveInMonth(lease, 2025, 2)).toBe(false);
    expect(leaseActiveInMonth(lease, 2025, 3)).toBe(true);
    expect(leaseActiveInMonth(lease, 2025, 8)).toBe(true);
    expect(leaseActiveInMonth(lease, 2025, 9)).toBe(false);
  });
  it("ohne Ende unbefristet aktiv", () => {
    expect(leaseActiveInMonth({ startDate: "2018-01-01", endDate: null }, 2025, 12)).toBe(true);
  });
});

describe("cellStatus", () => {
  it("unterscheidet bezahlt, teilweise, überfällig und offen", () => {
    expect(cellStatus(55_500, 55_500, "2025-03-01", "2025-09-26")).toBe("paid");
    expect(cellStatus(55_500, 60_000, "2025-03-01", "2025-09-26")).toBe("paid");
    expect(cellStatus(55_500, 25_500, "2025-08-01", "2025-09-26")).toBe("partial");
    expect(cellStatus(55_500, 0, "2025-07-01", "2025-09-26")).toBe("overdue");
    expect(cellStatus(55_500, 0, "2025-10-01", "2025-09-26")).toBe("open");
    expect(cellStatus(55_500, 0, "2025-09-26", "2025-09-26")).toBe("overdue");
  });
});

describe("buildMatrixRow", () => {
  // Wie Behl 2025: Vertrag bis 31.08., März und Juli unbezahlt
  const row = buildMatrixRow({
    year: 2025,
    today: "2026-09-27",
    lease: { id: "l1", startDate: "2018-01-01", endDate: "2025-08-31" },
    payments: [pay(1, 55_500), pay(2, 55_500), pay(3, null), pay(4, 55_500), pay(5, 55_500), pay(6, 55_500), pay(7, 0), pay(8, 55_500)],
  });

  it("setzt je Monat den passenden Status", () => {
    expect(row.cells.map((c) => c.status)).toEqual([
      "paid", "paid", "overdue", "paid", "paid", "paid", "overdue", "paid",
      "inactive", "inactive", "inactive", "inactive",
    ]);
    expect(row.cells[2]!.paymentId).toBe("p3");
  });

  it("summiert Soll, Ist und Rückstand der fälligen Monate", () => {
    expect(row.sollCents).toBe(8 * 55_500);
    expect(row.paidCents).toBe(6 * 55_500);
    expect(row.rueckstandCents).toBe(2 * 55_500);
  });

  it("markiert fällige Monate ohne Soll-Stellung als fehlend, künftige als offen", () => {
    const r = buildMatrixRow({
      year: 2025,
      today: "2025-06-15",
      lease: { id: "l2", startDate: "2025-01-01", endDate: null },
      payments: [pay(1, 55_500), pay(3, 55_500)],
    });
    expect(r.cells[1]!.status).toBe("missing");
    expect(r.cells[5]!.status).toBe("missing");
    expect(r.cells[6]!.status).toBe("open");
    expect(r.cells[11]!.status).toBe("open");
    expect(r.cells[11]!.paymentId).toBeNull();
  });

  it("zählt künftige Monate nicht in Soll/Rückstand, Überzahlung ergibt keinen negativen Rückstand", () => {
    const r = buildMatrixRow({
      year: 2025,
      today: "2025-02-10",
      lease: { id: "l3", startDate: "2025-01-01", endDate: null },
      payments: [pay(1, 60_000), pay(2, 0), pay(3, 0)],
    });
    expect(r.cells.slice(0, 3).map((c) => c.status)).toEqual(["paid", "overdue", "open"]);
    expect(r.sollCents).toBe(2 * 55_500);
    expect(r.rueckstandCents).toBe(55_500);
  });

  it("ignoriert Zahlungen anderer Jahre", () => {
    const r = buildMatrixRow({
      year: 2025,
      today: "2026-01-10",
      lease: { id: "l4", startDate: "2024-01-01", endDate: null },
      payments: [{ ...pay(12, 55_500), dueDate: "2024-12-01" }],
    });
    expect(r.cells[11]!.status).toBe("missing"); // Dez 2025 fällig (today 2026), aber ohne Soll
    expect(r.sollCents).toBe(0);
  });
});
