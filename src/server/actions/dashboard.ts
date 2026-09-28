"use server";

import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { expenses, leases, nkAbrechnungen } from "@/db/schema";
import { missingReceiptsByYear, resolveReceipts } from "@/lib/expense-receipts";
import { loadReceiptLinks } from "@/server/receipt-links";
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
  const receiptLinks = await loadReceiptLinks();

  const missingReceipts = [...missingReceiptsByYear(
    recentExpenses.map((e) => ({ ...e, receiptCount: resolveReceipts(e, receiptLinks).length })),
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
  });
}
