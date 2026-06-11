import { todayLocal } from "@/lib/dates";
export type LoanPayment = {
  dueDate: string;
  interestCents: number;
  principalCents: number;
  balanceAfterCents: number;
};

export type LoanForProjection = {
  id: string;
  description: string;
  loanType: string;
  balanceCents: number;
  balanceDate: string;
  initialAmountCents: number | null;
  interestRateBps: number;
  monthlyPaymentCents: number;
  loanPayments: LoanPayment[];
  property: { street: string; city: string };
  replacedByLoanId: string | null;
  bsTotalSumCents: number | null;
  bsSavingsBalanceCents: number | null;
  bsSavingsDate: string | null;
  bsMonthlySavingsCents: number | null;
  bsSavingsInterestBps: number | null;
  bsMinSavingsPermille: number | null;
  bsTargetRatingNumber: number | null;
  bsCurrentRatingNumber: number | null;
  bsLoanInterestBps: number | null;
  bsLoanMonthlyPaymentCents: number | null;
};

// Berechnet das voraussichtliche Zuteilungsdatum eines Bausparvertrags
// (Sparquoten-Kriterium, Bewertungszahl wird hier nicht projiziert)
export function projectBausparAllocation(bauspar: LoanForProjection): { yearMonth: string; savingsAtAllocation: number } | null {
  if (bauspar.bsTotalSumCents == null || bauspar.bsSavingsBalanceCents == null || bauspar.bsMinSavingsPermille == null || bauspar.bsMonthlySavingsCents == null) return null;
  const minRatio = bauspar.bsMinSavingsPermille / 1000;
  const target = bauspar.bsTotalSumCents * minRatio;
  const savings = bauspar.bsSavingsBalanceCents;
  const monthly = bauspar.bsMonthlySavingsCents;
  const savingsR = (bauspar.bsSavingsInterestBps ?? 0) / 10000 / 12;
  if (monthly <= 0) return null;

  let monthsNeeded = 0;
  if (savings < target) {
    let bal = savings;
    while (bal < target && monthsNeeded < 600) {
      bal = bal * (1 + savingsR) + monthly;
      monthsNeeded++;
    }
  }
  const startYM = bauspar.bsSavingsDate ?? todayLocal();
  const [sy, sm] = startYM.split("-").map(Number) as [number, number];
  const d = new Date(sy, sm - 1 + monthsNeeded, 1);
  const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  let savingsAtAllocation = savings;
  for (let i = 0; i < monthsNeeded; i++) {
    savingsAtAllocation = savingsAtAllocation * (1 + savingsR) + monthly;
  }
  return { yearMonth, savingsAtAllocation: Math.round(savingsAtAllocation) };
}

// Projiziert den Tilgungsplan: annuity, interest_only (Vorfinanzierung) oder bauspar (Phasenwechsel).
export function projectSchedule(loan: LoanForProjection, maxMonths = 600, allLoans?: LoanForProjection[]): LoanPayment[] {
  const r = loan.interestRateBps / 10000 / 12;
  const existing = [...loan.loanPayments];
  const result: LoanPayment[] = [...existing];

  if (loan.loanType === "interest_only") {
    let allocationYM: string | null = null;
    if (allLoans && loan.replacedByLoanId) {
      const bauspar = allLoans.find((l) => l.id === loan.replacedByLoanId);
      if (bauspar) {
        const alloc = projectBausparAllocation(bauspar);
        if (alloc) allocationYM = alloc.yearMonth;
      }
    }
    let balance = loan.balanceCents;
    let y: number, m: number;
    if (existing.length > 0) {
      const last = existing[existing.length - 1]!;
      balance = last.balanceAfterCents;
      const [ly, lm] = last.dueDate.split("-").map(Number) as [number, number];
      m = lm + 1; y = ly;
      if (m > 12) { m = 1; y++; }
    } else {
      const [by, bm] = loan.balanceDate.split("-").map(Number) as [number, number];
      y = by; m = bm;
    }
    for (let i = 0; i < maxMonths; i++) {
      const dueDate = `${y}-${String(m).padStart(2, "0")}-01`;
      const ym = dueDate.slice(0, 7);
      const interestCents = Math.round(balance * r);
      if (allocationYM && ym >= allocationYM) {
        result.push({ dueDate, interestCents: 0, principalCents: balance, balanceAfterCents: 0 });
        break;
      }
      result.push({ dueDate, interestCents, principalCents: 0, balanceAfterCents: balance });
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return result;
  }

  if (loan.loanType === "bauspar") {
    const alloc = projectBausparAllocation(loan);
    if (!alloc) return existing;
    const startYM = loan.bsSavingsDate ?? loan.balanceDate;
    const [sy, sm] = startYM.split("-").map(Number) as [number, number];
    let y = sy, m = sm;

    while (`${y}-${String(m).padStart(2, "0")}` < alloc.yearMonth) {
      const dueDate = `${y}-${String(m).padStart(2, "0")}-01`;
      result.push({ dueDate, interestCents: 0, principalCents: 0, balanceAfterCents: 0 });
      m++;
      if (m > 12) { m = 1; y++; }
      if (result.length > maxMonths) return result;
    }

    const loanInterestR = (loan.bsLoanInterestBps ?? loan.interestRateBps) / 10000 / 12;
    const loanMonthlyPayment = loan.bsLoanMonthlyPaymentCents ?? loan.monthlyPaymentCents;
    let balance = Math.max(0, (loan.bsTotalSumCents ?? 0) - alloc.savingsAtAllocation);
    while (balance > 0 && result.length < maxMonths) {
      const dueDate = `${y}-${String(m).padStart(2, "0")}-01`;
      const interestCents = Math.round(balance * loanInterestR);
      const principalCents = Math.min(loanMonthlyPayment - interestCents, balance);
      if (principalCents <= 0) break;
      const balanceAfterCents = balance - principalCents;
      result.push({ dueDate, interestCents, principalCents, balanceAfterCents });
      balance = balanceAfterCents;
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return result;
  }

  // Annuitätendarlehen (Standard)
  let balance: number;
  let y: number;
  let m: number;
  if (existing.length > 0) {
    const last = existing[existing.length - 1]!;
    balance = last.balanceAfterCents;
    const [ly, lm] = last.dueDate.split("-").map(Number) as [number, number];
    m = lm + 1;
    y = ly;
    if (m > 12) { m = 1; y++; }
  } else {
    balance = loan.balanceCents;
    const [by, bm] = loan.balanceDate.split("-").map(Number) as [number, number];
    y = by;
    m = bm;
  }

  for (let i = 0; i < maxMonths && balance > 0; i++) {
    const interestCents = Math.round(balance * r);
    const principalCents = Math.min(loan.monthlyPaymentCents - interestCents, balance);
    if (principalCents <= 0) break;
    const balanceAfterCents = balance - principalCents;
    const dueDate = `${y}-${String(m).padStart(2, "0")}-01`;
    result.push({ dueDate, interestCents, principalCents, balanceAfterCents });
    balance = balanceAfterCents;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}

// Projiziert das Sparguthaben eines Bausparvertrags pro Monat
export function projectBausparSavings(bauspar: LoanForProjection, untilYM: string): Map<string, number> {
  const map = new Map<string, number>();
  if (bauspar.bsSavingsBalanceCents == null || bauspar.bsMonthlySavingsCents == null) return map;
  const alloc = projectBausparAllocation(bauspar);
  const allocYM = alloc?.yearMonth ?? null;
  const savingsR = (bauspar.bsSavingsInterestBps ?? 0) / 10000 / 12;
  const startYM = bauspar.bsSavingsDate ?? todayLocal();
  const [sy, sm] = startYM.split("-").map(Number) as [number, number];
  let y = sy, m = sm;
  let balance = bauspar.bsSavingsBalanceCents;
  for (let i = 0; i < 600; i++) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    if (ym > untilYM) break;
    map.set(ym, Math.round(balance));
    if (allocYM && ym >= allocYM) {
      map.set(ym, 0);
      break;
    }
    balance = balance * (1 + savingsR) + (bauspar.bsMonthlySavingsCents ?? 0);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return map;
}

// Restschuldentwicklung: monatliche Datenpunkte pro Darlehen + Gesamt + Nettoverschuldung
export function buildBalanceData(loans: LoanForProjection[]) {
  const schedules = loans.map((l) => ({ loan: l, payments: projectSchedule(l, 600, loans) }));
  if (schedules.every((s) => s.payments.length === 0)) return [];

  const allDates = new Set<string>();
  schedules.forEach(({ payments }) => payments.forEach((p) => allDates.add(p.dueDate.slice(0, 7))));
  const sorted = Array.from(allDates).sort();
  if (sorted.length === 0) return [];
  const lastYM = sorted[sorted.length - 1]!;

  const bausparSavingsMaps = loans
    .filter((l) => l.loanType === "bauspar")
    .map((l) => projectBausparSavings(l, lastYM));
  const hasBauspar = bausparSavingsMaps.length > 0;

  return sorted.map((ym) => {
    const row: Record<string, number | string> = { month: ym };
    let total = 0;
    schedules.forEach(({ loan, payments }) => {
      const p = payments.find((x) => x.dueDate.slice(0, 7) === ym);
      const val = p ? p.balanceAfterCents : 0;
      row[loan.id] = val;
      total += val;
    });
    row["gesamt"] = total;
    if (hasBauspar) {
      const totalSavings = bausparSavingsMaps.reduce((s, map) => s + (map.get(ym) ?? 0), 0);
      row["netto"] = total - totalSavings;
    }
    return row;
  });
}

// Jährliche Zins/Tilgungs-Aufschlüsselung mit Rumpfjahres-Hochrechnung
export function buildYearlyData(loans: LoanForProjection[]) {
  const schedules = loans.map((l) => projectSchedule(l));

  type YearAgg = {
    interestCents: number;
    principalCents: number;
    interestHochrechnungCents: number;
    principalHochrechnungCents: number;
    partialLoanMonths: { actual: number; expected: number }[];
  };
  const yearMap = new Map<number, YearAgg>();
  const ensure = (year: number): YearAgg => {
    const existing = yearMap.get(year);
    if (existing) return existing;
    const fresh: YearAgg = { interestCents: 0, principalCents: 0, interestHochrechnungCents: 0, principalHochrechnungCents: 0, partialLoanMonths: [] };
    yearMap.set(year, fresh);
    return fresh;
  };

  schedules.forEach((payments) => {
    if (payments.length === 0) return;
    const startYear = parseInt(payments[0]!.dueDate.slice(0, 4), 10);

    const perYear = new Map<number, { interest: number; principal: number; months: number }>();
    payments.forEach((p) => {
      const y = parseInt(p.dueDate.slice(0, 4), 10);
      const cur = perYear.get(y) ?? { interest: 0, principal: 0, months: 0 };
      cur.interest += p.interestCents;
      cur.principal += p.principalCents;
      cur.months += 1;
      perYear.set(y, cur);
    });

    perYear.forEach((v, year) => {
      const agg = ensure(year);
      agg.interestCents += v.interest;
      agg.principalCents += v.principal;

      if (year === startYear && v.months < 12) {
        const factor = 12 / v.months;
        agg.interestHochrechnungCents += Math.round(v.interest * factor - v.interest);
        agg.principalHochrechnungCents += Math.round(v.principal * factor - v.principal);
        agg.partialLoanMonths.push({ actual: v.months, expected: 12 });
      }
    });
  });

  return Array.from(yearMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, agg]) => {
      const isPartial = agg.partialLoanMonths.length > 0;
      const actualMonths = agg.partialLoanMonths.reduce((s, p) => s + p.actual, 0);
      const expectedMonths = agg.partialLoanMonths.reduce((s, p) => s + p.expected, 0);
      return {
        year: String(year),
        zinsen: Math.round(agg.interestCents / 100),
        tilgung: Math.round(agg.principalCents / 100),
        zinsenHochrechnung: Math.round(agg.interestHochrechnungCents / 100),
        tilgungHochrechnung: Math.round(agg.principalHochrechnungCents / 100),
        isPartial,
        actualMonths,
        expectedMonths,
      };
    });
}

export type YearlyRow = ReturnType<typeof buildYearlyData>[number];
