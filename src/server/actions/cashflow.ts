"use server";

import { and, asc, isNull, lte, gte } from "drizzle-orm";
import { db } from "@/db";
import { leases, payments, expenses, loans, loanPayments, properties, rentAdjustments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { projectBausparAllocation, type LoanForProjection } from "@/lib/loan-projection";
import { effectiveRentAt } from "@/lib/rent";

export type CashflowMonth = {
  ym: string;                          // YYYY-MM
  isFuture: boolean;                   // Monat liegt nach aktuellem Monat
  isCurrent: boolean;                  // aktueller Monat
  income: {
    actualCents: number;               // tatsächlich erhaltene Mietzahlungen (warm: Kalt + NK)
    expectedCents: number;             // Sollmiete warm (Kalt + NK)
    actualColdCents: number;           // tatsächlich erhaltene Kaltmiete (proportional aus paidCents)
    expectedColdCents: number;         // Sollmiete kalt (nur rentCents)
  };
  expenses: {
    actualCents: number;               // gebuchte einmalige & wiederkehrende Ausgaben
    projectedRecurringCents: number;   // hochgerechnete wiederkehrende Ausgaben (nur Zukunft)
  };
  loans: {
    actualCents: number;               // bezahlte Darlehensraten
    expectedCents: number;             // monatliche Soll-Raten aller aktiven Darlehen
  };
};

export type CashflowByProperty = {
  propertyId: string;
  street: string;
  city: string;
  months: CashflowMonth[];
};

export type CashflowResult = {
  year: number;
  total: CashflowMonth[];
  perProperty: CashflowByProperty[];
};

function makeEmptyMonth(year: number, monthIdx: number): CashflowMonth {
  const today = new Date();
  const todayYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const ym = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
  return {
    ym,
    isFuture: ym > todayYM,
    isCurrent: ym === todayYM,
    income: { actualCents: 0, expectedCents: 0, actualColdCents: 0, expectedColdCents: 0 },
    expenses: { actualCents: 0, projectedRecurringCents: 0 },
    loans: { actualCents: 0, expectedCents: 0 },
  };
}

// Effektiver Rent + ServiceCharges für ein Lease zum Stichtag (Kalt-NK-Carry-Forward)
function effectiveRent(lease: { rentCents: number; serviceChargesCents: number | null }, adjustments: Array<{ effectiveDate: string; rentCents: number; serviceChargesCents: number | null }>, ym: string) {
  const { rentCents, serviceChargesCents } = effectiveRentAt(lease, adjustments, `${ym}-01`);
  return { rent: rentCents, sc: serviceChargesCents ?? 0 };
}

export async function getCashflowAction(year: number): Promise<CashflowResult> {
  await requireUser();

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const monthsPerProperty = new Map<string, { property: { id: string; street: string; city: string }; months: CashflowMonth[] }>();
  const total: CashflowMonth[] = Array.from({ length: 12 }, (_, i) => makeEmptyMonth(year, i));

  // Properties laden
  const allProperties = await db.query.properties.findMany({
    where: isNull(properties.deletedAt),
    orderBy: [asc(properties.street)],
  });
  for (const p of allProperties) {
    monthsPerProperty.set(p.id, {
      property: { id: p.id, street: p.street, city: p.city },
      months: Array.from({ length: 12 }, (_, i) => makeEmptyMonth(year, i)),
    });
  }

  function bumpProperty(propertyId: string | null | undefined, monthIdx: number, mutate: (m: CashflowMonth) => void) {
    if (!propertyId) return;
    const entry = monthsPerProperty.get(propertyId);
    if (!entry) return;
    const m = entry.months[monthIdx];
    if (m) mutate(m);
  }
  function bumpTotal(monthIdx: number, mutate: (m: CashflowMonth) => void) {
    const m = total[monthIdx];
    if (m) mutate(m);
  }

  // ── Mieteinnahmen (Payments) ──
  // IST: payments mit dueDate im Jahr
  const yearPayments = await db.query.payments.findMany({
    where: and(
      isNull(payments.deletedAt),
      gte(payments.dueDate, yearStart),
      lte(payments.dueDate, yearEnd),
    ),
    with: { lease: { with: { unit: { with: { property: true } } } } },
  });
  for (const p of yearPayments) {
    const monthIdx = parseInt(p.dueDate.slice(5, 7), 10) - 1;
    const sollWarm = p.rentCents + (p.serviceChargesCents ?? 0);
    const sollCold = p.rentCents;
    const paidWarm = p.paidCents ?? 0;
    // Anteilige Aufteilung der Ist-Zahlung auf Kalt/NK
    const paidCold = sollWarm > 0 ? Math.round(paidWarm * (sollCold / sollWarm)) : paidWarm;
    const propId = p.lease.unit.property.id;
    bumpTotal(monthIdx, (m) => {
      m.income.expectedCents += sollWarm;
      m.income.actualCents += paidWarm;
      m.income.expectedColdCents += sollCold;
      m.income.actualColdCents += paidCold;
    });
    bumpProperty(propId, monthIdx, (m) => {
      m.income.expectedCents += sollWarm;
      m.income.actualCents += paidWarm;
      m.income.expectedColdCents += sollCold;
      m.income.actualColdCents += paidCold;
    });
  }

  // PROGNOSE: Aktive Leases, für Monate ohne payment-Eintrag → Sollmiete hochrechnen
  const activeLeases = await db.query.leases.findMany({
    where: isNull(leases.deletedAt),
    with: {
      unit: { with: { property: true } },
      rentAdjustments: { where: isNull(rentAdjustments.deletedAt) },
      rentComponents: true,
    },
  });
  for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
    const ym = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
    const monthStart = `${ym}-01`;
    for (const lease of activeLeases) {
      // Lease aktiv im Monat?
      const startedBefore = lease.startDate <= `${ym}-31`;
      const stillRunning = !lease.endDate || lease.endDate >= monthStart;
      if (!startedBefore || !stillRunning) continue;
      // Existiert bereits ein Payment? → schon im IST gezählt
      const hasPayment = yearPayments.some((p) => p.leaseId === lease.id && p.dueDate.startsWith(ym));
      if (hasPayment) continue;

      const { rent, sc } = effectiveRent(lease, lease.rentAdjustments ?? [], ym);
      const componentsCents = lease.rentComponents.reduce((s, c) => s + c.amountCents, 0);
      const coldCents = rent + componentsCents;
      const sollWarm = coldCents + sc;
      const propId = lease.unit.property.id;
      bumpTotal(monthIdx, (m) => {
        m.income.expectedCents += sollWarm;
        m.income.expectedColdCents += coldCents;
      });
      bumpProperty(propId, monthIdx, (m) => {
        m.income.expectedCents += sollWarm;
        m.income.expectedColdCents += coldCents;
      });
    }
  }

  // ── Ausgaben (Expenses) ──
  // Alle Ausgaben laden — wir filtern in JS, weil Leistungszeiträume jahresübergreifend sein können.
  const allExpenses = await db.query.expenses.findMany({
    where: isNull(expenses.deletedAt),
  });

  // Hilfsfunktion: monatliche Verteilung eines Ausgabe-Betrags auf den Ziel-Year
  // Gibt für jeden monthIdx (0..11) den proportionalen Betrag zurück.
  // shiftYears: 0 = Originalperiode, >0 = projizierte Wiederholung (jährlich nach hinten).
  function distributeToYear(
    e: typeof allExpenses[number],
    targetYear: number,
    shiftYears: number,
  ): { perMonth: number[]; coveredMonths: number } {
    const perMonth = new Array(12).fill(0);

    // Periode (verschoben um shiftYears)
    let periodStart = e.servicePeriodStart;
    let periodEnd = e.servicePeriodEnd;
    if (shiftYears !== 0 && periodStart && periodEnd) {
      const shift = (iso: string) => {
        const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
        return `${y + shiftYears}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      };
      periodStart = shift(periodStart);
      periodEnd = shift(periodEnd);
    }

    if (!periodStart || !periodEnd) {
      // Spezialfall Grundsteuer: über die 12 Monate des Buchungsjahres verteilen
      if (e.category === "bk_grundsteuer") {
        const bookingYear = parseInt(e.date.slice(0, 4), 10) + shiftYears;
        if (bookingYear !== targetYear) return { perMonth, coveredMonths: 0 };
        const per = Math.round(e.amountCents / 12);
        for (let i = 0; i < 12; i++) perMonth[i] = per;
        return { perMonth, coveredMonths: 12 };
      }
      // Keine Periode — Buchungs-/Zahldatum verwenden (ggf. mit shift)
      const dateShifted = shiftYears === 0
        ? e.date
        : `${parseInt(e.date.slice(0, 4), 10) + shiftYears}${e.date.slice(4)}`;
      if (!dateShifted.startsWith(String(targetYear))) return { perMonth, coveredMonths: 0 };
      const idx = parseInt(dateShifted.slice(5, 7), 10) - 1;
      perMonth[idx] = e.amountCents;
      return { perMonth, coveredMonths: 1 };
    }

    // Anzahl Monate in der Gesamtperiode (inklusive)
    const [sy, sm] = periodStart.split("-").map(Number) as [number, number, number];
    const [ey, em] = periodEnd.split("-").map(Number) as [number, number, number];
    const totalMonths = (ey - sy) * 12 + (em - sm) + 1;
    if (totalMonths <= 0) return { perMonth, coveredMonths: 0 };
    const perMonthCents = Math.round(e.amountCents / totalMonths);

    let covered = 0;
    for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
      const ym = `${targetYear}-${String(monthIdx + 1).padStart(2, "0")}`;
      const startYM = `${sy}-${String(sm).padStart(2, "0")}`;
      const endYM = `${ey}-${String(em).padStart(2, "0")}`;
      if (ym >= startYM && ym <= endYM) {
        perMonth[monthIdx] = perMonthCents;
        covered++;
      }
    }
    return { perMonth, coveredMonths: covered };
  }

  // IST: alle Ausgaben deren Periode (oder Datum) das Zieljahr berührt
  for (const e of allExpenses) {
    // WEG-Einzelposten überspringen — der echte Geldfluss ist über das monatliche
    // Hausgeld (weg_hausgeld) und den Saldo (weg_saldo) abgebildet.
    if (e.wegAbrechnungId) continue;
    const { perMonth, coveredMonths } = distributeToYear(e, year, 0);
    if (coveredMonths === 0) continue;
    for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
      const c = perMonth[monthIdx]!;
      if (c === 0) continue;
      bumpTotal(monthIdx, (m) => { m.expenses.actualCents += c; });
      bumpProperty(e.propertyId, monthIdx, (m) => { m.expenses.actualCents += c; });
    }
  }

  // PROGNOSE: Wiederkehrende Ausgaben aus Vorjahren auf Zieljahr projizieren.
  // Wir gehen bis zu 3 Jahre zurück, falls ein Datensatz älter ist.
  const today = new Date();
  const todayYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  for (const e of allExpenses) {
    if (!e.isRecurring) continue;
    if (e.wegAbrechnungId) continue; // WEG-Posten nicht doppelt projizieren
    // Welches Vorjahr soll als Quelle dienen? Suche nach Quelljahr, sodass shift = year - Quelljahr > 0
    const baseYear = e.servicePeriodStart
      ? parseInt(e.servicePeriodStart.slice(0, 4), 10)
      : parseInt(e.date.slice(0, 4), 10);
    for (let shift = 1; shift <= 3; shift++) {
      const sourceYear = year - shift;
      if (sourceYear !== baseYear) continue;
      const { perMonth } = distributeToYear(e, year, shift);
      for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
        const ym = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
        if (ym < todayYM) continue; // Vergangene Monate sind IST-basiert
        const c = perMonth[monthIdx]!;
        if (c === 0) continue;
        // Duplikat-Check: schon eine echte Ausgabe gleicher Kategorie+Objekt im Monat?
        const alreadyBooked = allExpenses.some((y) => {
          if (y.id === e.id) return false;
          if (y.category !== e.category) return false;
          if (y.propertyId !== e.propertyId) return false;
          const yDist = distributeToYear(y, year, 0);
          return (yDist.perMonth[monthIdx] ?? 0) > 0;
        });
        if (alreadyBooked) continue;
        bumpTotal(monthIdx, (m) => { m.expenses.projectedRecurringCents += c; });
        bumpProperty(e.propertyId, monthIdx, (m) => { m.expenses.projectedRecurringCents += c; });
      }
      break; // pro recurring expense nur eine Projektion
    }
  }

  // ── Darlehen ──
  // IST: bezahlte loanPayments des Jahres
  const yearLoanPayments = await db.query.loanPayments.findMany({
    where: and(
      isNull(loanPayments.deletedAt),
      gte(loanPayments.dueDate, yearStart),
      lte(loanPayments.dueDate, yearEnd),
    ),
    with: { loan: true },
  });
  for (const lp of yearLoanPayments) {
    if (!lp.paidAt) continue;
    const monthIdx = parseInt(lp.dueDate.slice(5, 7), 10) - 1;
    bumpTotal(monthIdx, (m) => { m.loans.actualCents += lp.totalCents; });
    bumpProperty(lp.loan.propertyId, monthIdx, (m) => { m.loans.actualCents += lp.totalCents; });
  }

  // PROGNOSE: Erwartete monatliche Rate jedes aktiven Darlehens — typabhängig:
  //   • annuity:       monthlyPaymentCents (Zins + Tilgung)
  //   • interest_only: monthlyPaymentCents bis zur Ablöse durch verknüpften Bauspar, danach 0
  //   • bauspar:       bsMonthlySavingsCents (Sparrate) vor Zuteilung, bsLoanMonthlyPaymentCents / monthlyPaymentCents danach
  const activeLoans = await db.query.loans.findMany({
    where: isNull(loans.deletedAt),
  });

  // Zuteilungs-Datum jedes Bausparvertrags vorberechnen
  const allocationByBauspar = new Map<string, string>();
  for (const loan of activeLoans) {
    if (loan.loanType === "bauspar") {
      const alloc = projectBausparAllocation(loan as unknown as LoanForProjection);
      if (alloc) allocationByBauspar.set(loan.id, alloc.yearMonth);
    }
  }

  function loanCashOutForMonth(loan: typeof activeLoans[number], ym: string): number {
    if (loan.loanType === "interest_only") {
      // Ablöse-Termin (falls verknüpfter Bauspar existiert)
      const allocYM = loan.replacedByLoanId ? allocationByBauspar.get(loan.replacedByLoanId) : null;
      if (allocYM && ym >= allocYM) return 0;
      return loan.monthlyPaymentCents;
    }
    if (loan.loanType === "bauspar") {
      const allocYM = allocationByBauspar.get(loan.id);
      // Vor Zuteilung: Sparrate (Tilgungsersatzleistung)
      if (!allocYM || ym < allocYM) {
        return loan.bsMonthlySavingsCents ?? 0;
      }
      // Nach Zuteilung: Bauspardarlehensrate
      return loan.bsLoanMonthlyPaymentCents ?? loan.monthlyPaymentCents;
    }
    // annuity (oder unbekannter Typ)
    return loan.monthlyPaymentCents;
  }

  for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
    const ym = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
    for (const loan of activeLoans) {
      const cashOut = loanCashOutForMonth(loan, ym);
      if (cashOut <= 0) continue;
      bumpTotal(monthIdx, (m) => { m.loans.expectedCents += cashOut; });
      bumpProperty(loan.propertyId, monthIdx, (m) => { m.loans.expectedCents += cashOut; });
    }
  }

  const perProperty: CashflowByProperty[] = Array.from(monthsPerProperty.values())
    .map((entry) => ({
      propertyId: entry.property.id,
      street: entry.property.street,
      city: entry.property.city,
      months: entry.months,
    }))
    // Nur Properties mit irgendeiner Aktivität zeigen
    .filter((p) => p.months.some((m) => m.income.expectedCents > 0 || m.expenses.actualCents > 0 || m.expenses.projectedRecurringCents > 0 || m.loans.expectedCents > 0));

  return { year, total, perProperty };
}
