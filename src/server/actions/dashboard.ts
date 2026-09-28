"use server";

import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { expenses, leases, nkAbrechnungen, properties, trips, vehicleCosts, vehicles } from "@/db/schema";
import { RECEIPT_TASK_MIN_CENTS } from "@/lib/expense-receipts";
import { frequentDestinations } from "@/lib/vehicle-rate";
import { computeVehicleYearFor } from "@/server/trip-sync";
import { readBackupStatus } from "@/server/backup-status";
import { backupHealth } from "@/lib/backup-status";
import { missingReceiptsByYear } from "@/lib/expense-receipts";
import { expenseReceipts, loadReceiptContext } from "@/server/receipt-links";
import { requireUser } from "@/lib/auth";
import { todayLocal } from "@/lib/dates";
import { buildFixedRateTimeline } from "@/lib/loan-projection";
import { buildDashboardTasks, type DashboardTask } from "@/lib/dashboard-tasks";
import { getLoanAnalyticsAction } from "@/server/actions/loans";
import { getPaymentMatrixAction } from "@/server/actions/payments";

function addDays(iso: string, days: number) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + days));
  return d.toISOString().slice(0, 10);
}

// Aufgabenliste für das Dashboard („Was ist zu tun?")
export async function getDashboardTasksAction(): Promise<DashboardTask[]> {
  await requireUser();
  const today = todayLocal();
  const year = parseInt(today.slice(0, 4), 10);

  const [loanList, matrixNow, matrixPrev, ending, prepaymentLeases, nkPrev, recentExpenses] = await Promise.all([
    getLoanAnalyticsAction(),
    getPaymentMatrixAction(year),
    getPaymentMatrixAction(year - 1),
    db.query.leases.findMany({
      where: and(isNull(leases.deletedAt), gte(leases.endDate, today), lte(leases.endDate, addDays(today, 60))),
      with: { unit: true, leaseTenants: { with: { tenant: true } } },
    }),
    // Verträge mit NK-Vorauszahlungen, die im Vorjahr aktiv waren → Abrechnungspflicht
    db.query.leases.findMany({
      where: and(
        isNull(leases.deletedAt),
        eq(leases.serviceChargesType, "prepayment"),
        lte(leases.startDate, `${year - 1}-12-31`),
        or(isNull(leases.endDate), gte(leases.endDate, `${year - 1}-01-01`)),
      ),
      with: { unit: { with: { property: true } } },
    }),
    db.query.nkAbrechnungen.findMany({
      where: and(isNull(nkAbrechnungen.deletedAt), eq(nkAbrechnungen.year, year - 1)),
    }),
    // Ausgaben des Vor- und laufenden Jahres (bis heute) für die Belegprüfung
    db.query.expenses.findMany({
      where: and(isNull(expenses.deletedAt), gte(expenses.date, `${year - 1}-01-01`), lte(expenses.date, today)),
    }),
  ]);
  const receiptCtx = await loadReceiptContext();

  // Fahrzeuge: vorläufige km-Sätze (abgeschlossene Jahre mit Fahrten), Kosten ohne Beleg, häufige Ziele
  const [vehicleList, recentTrips, recentCosts, propertyList] = await Promise.all([
    db.query.vehicles.findMany({ where: isNull(vehicles.deletedAt) }),
    db.query.trips.findMany({ where: and(isNull(trips.deletedAt), gte(trips.date, `${year - 1}-01-01`)) }),
    db.query.vehicleCosts.findMany({ where: and(isNull(vehicleCosts.deletedAt), gte(vehicleCosts.date, `${year - 1}-01-01`), lte(vehicleCosts.date, today)) }),
    db.query.properties.findMany({ where: isNull(properties.deletedAt) }),
  ]);
  const provisionalVehicleYears: Array<{ vehicleId: string; label: string; year: number }> = [];
  for (const v of vehicleList) {
    for (const y of new Set(recentTrips.filter((t) => t.vehicleId === v.id).map((t) => +t.date.slice(0, 4)))) {
      if (y >= year) continue;
      const calc = await computeVehicleYearFor(v.id, y);
      if (calc?.result.provisional) provisionalVehicleYears.push({ vehicleId: v.id, label: v.name, year: y });
    }
  }
  const costMissing = new Map<number, { year: number; count: number; cents: number }>();
  for (const c of recentCosts) {
    if (Math.abs(c.amountCents) < RECEIPT_TASK_MIN_CENTS || (receiptCtx.byTarget.get(`vehicle_cost:${c.id}`)?.length ?? 0) > 0) continue;
    const y = +c.date.slice(0, 4);
    const cur = costMissing.get(y) ?? { year: y, count: 0, cents: 0 };
    cur.count++;
    cur.cents += c.amountCents;
    costMissing.set(y, cur);
  }
  const propLabel = new Map(propertyList.map((p) => [p.id, `${p.street}, ${p.city}`]));
  const frequent = frequentDestinations(recentTrips).map((f) => ({ ...f, label: propLabel.get(f.propertyId) ?? "" }));

  const missingReceipts = [...missingReceiptsByYear(
    recentExpenses.map((e) => ({ ...e, receiptCount: expenseReceipts(e, receiptCtx).length })),
  )].map(([y, v]) => ({ year: y, ...v }));

  const missingDues: Array<{ leaseId: string; label: string; months: string[] }> = [];
  const arrears: Array<{ leaseId: string; label: string; cents: number; year: number }> = [];
  for (const m of [matrixPrev, matrixNow]) {
    for (const r of m.rows) {
      const months = r.cells
        .filter((c) => c.status === "missing")
        .map((c) => `${m.year}-${String(c.month).padStart(2, "0")}`);
      if (months.length > 0) missingDues.push({ leaseId: r.leaseId, label: r.tenantNames, months });
      if (r.rueckstandCents > 0) arrears.push({ leaseId: r.leaseId, label: r.tenantNames, cents: r.rueckstandCents, year: m.year });
    }
  }

  const statementProps = new Set(nkPrev.map((a) => a.propertyId));
  const missingNk = new Map<string, { propertyId: string; label: string; year: number }>();
  for (const l of prepaymentLeases) {
    const p = l.unit.property;
    if (p.deletedAt || statementProps.has(p.id)) continue;
    missingNk.set(p.id, { propertyId: p.id, label: `${p.street}, ${p.city}`, year: year - 1 });
  }

  return buildDashboardTasks({
    today,
    fixedRates: buildFixedRateTimeline(loanList, today),
    missingDues,
    arrears,
    endingLeases: ending
      .filter((l) => l.endDate)
      .map((l) => ({
        leaseId: l.id,
        label: `${[...new Set(l.leaseTenants.map((lt) => lt.tenant.lastName))].join(" / ") || "(ohne Mieter)"} · ${l.unit.name}`,
        endDate: l.endDate!,
      })),
    missingNkStatements: [...missingNk.values()],
    missingReceipts,
    provisionalVehicleYears,
    vehicleCostsMissingReceipts: [...costMissing.values()],
    frequentDestinations: frequent,
    backup: await readBackupStatus().then((s) => ({ health: backupHealth(s, new Date()), finishedAt: s?.finishedAt ?? null, message: s?.message ?? "" })),
  });
}
