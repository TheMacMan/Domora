"use server";

import { todayLocal } from "@/lib/dates";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, gt, isNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { loans, loanPayments, loanInterestYears } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { toCents } from "@/lib/money";
import { loanSchema, type LoanFormInput } from "@/lib/validators/loan";
import { writeAuditLog } from "@/lib/audit";

type ActionResult = { ok: true } | { ok: false; error: string };
type GenerateResult = { ok: true; created: number } | { ok: false; error: string };

function calcInterestCents(balanceCents: number, interestRateBps: number): number {
  return Math.round(balanceCents * interestRateBps / 10000 / 12);
}

function nextMonthStart(dueDate: string): string {
  const [y, m] = dueDate.split("-").map(Number) as [number, number];
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function centsOrNull(eur: number | undefined | null): number | null {
  return eur != null ? toCents(eur) : null;
}

function bpsOrNull(percent: number | undefined | null): number | null {
  return percent != null ? Math.round(percent * 100) : null;
}

function permilleOrNull(percent: number | undefined | null): number | null {
  return percent != null ? Math.round(percent * 10) : null;
}

function toDb(data: LoanFormInput) {
  const isBauspar = data.loanType === "bauspar";
  return {
    propertyId: data.propertyId,
    description: data.description,
    loanType: data.loanType,
    initialAmountCents: centsOrNull(data.initialAmountEur),
    balanceCents: toCents(data.balanceEur),
    interestRateBps: Math.round(data.interestRatePercent * 100),
    monthlyPaymentCents: toCents(data.monthlyPaymentEur),
    startDate: data.startDate || null,
    balanceDate: data.balanceDate,
    interestFixedUntil: data.interestFixedUntil || null,
    replacedByLoanId: data.replacedByLoanId || null,
    bsTotalSumCents: isBauspar ? centsOrNull(data.bsTotalSumEur) : null,
    bsSavingsBalanceCents: isBauspar ? centsOrNull(data.bsSavingsBalanceEur) : null,
    bsSavingsDate: isBauspar ? data.bsSavingsDate || null : null,
    bsMonthlySavingsCents: isBauspar ? centsOrNull(data.bsMonthlySavingsEur) : null,
    bsSavingsInterestBps: isBauspar ? bpsOrNull(data.bsSavingsInterestPercent) : null,
    bsMinSavingsPermille: isBauspar ? permilleOrNull(data.bsMinSavingsPercent) : null,
    bsTargetRatingNumber: isBauspar ? data.bsTargetRatingNumber ?? null : null,
    bsCurrentRatingNumber: isBauspar ? data.bsCurrentRatingNumber ?? null : null,
    bsRatingDate: isBauspar ? data.bsRatingDate || null : null,
    bsLoanInterestBps: isBauspar ? bpsOrNull(data.bsLoanInterestPercent) : null,
    bsLoanMonthlyPaymentCents: isBauspar ? centsOrNull(data.bsLoanMonthlyPaymentEur) : null,
    notes: data.notes ?? null,
  };
}

export async function createLoanAction(data: LoanFormInput): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = loanSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const id = createId();
  await db.insert(loans).values({ id, ...toDb(parsed.data) });

  await writeAuditLog({ userId: user.id, action: "loan.create", entity: "loan", entityId: id, after: parsed.data });

  revalidatePath("/loans");
  return { ok: true };
}

export async function updateLoanAction(id: string, data: LoanFormInput): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = loanSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const before = await db.query.loans.findFirst({ where: eq(loans.id, id) });
  if (!before || before.deletedAt) return { ok: false, error: "Darlehen nicht gefunden." };

  await db.update(loans).set({ ...toDb(parsed.data), updatedAt: new Date() }).where(eq(loans.id, id));

  await writeAuditLog({ userId: user.id, action: "loan.update", entity: "loan", entityId: id, before: before as Record<string, unknown>, after: parsed.data });

  revalidatePath("/loans");
  revalidatePath(`/loans/${id}`);
  return { ok: true };
}

export async function deleteLoanAction(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const loan = await db.query.loans.findFirst({ where: eq(loans.id, id) });
  if (!loan || loan.deletedAt) return { ok: false, error: "Darlehen nicht gefunden." };

  await db.update(loans).set({ deletedAt: new Date() }).where(eq(loans.id, id));

  await writeAuditLog({ userId: user.id, action: "loan.delete", entity: "loan", entityId: id, before: loan as Record<string, unknown> });

  revalidatePath("/loans");
  return { ok: true };
}

export async function getLoansAction() {
  await requireUser();
  return db.query.loans.findMany({
    where: isNull(loans.deletedAt),
    orderBy: [asc(loans.balanceDate)],
    with: { property: true },
  });
}

export async function getLoanAction(id: string) {
  await requireUser();
  return db.query.loans.findFirst({
    where: and(eq(loans.id, id), isNull(loans.deletedAt)),
    with: {
      property: true,
      loanPayments: {
        where: isNull(loanPayments.deletedAt),
        orderBy: [asc(loanPayments.dueDate)],
      },
      interestYears: {
        orderBy: [desc(loanInterestYears.year)],
      },
    },
  });
}

// Erfasst/aktualisiert die tatsächlich gezahlten Schuldzinsen eines Darlehens für
// ein Kalenderjahr (aus der Zinsbescheinigung). Hat in Anlage V Vorrang vor den
// aus dem Tilgungsplan berechneten Zinsen. Upsert über (loanId, year).
export async function setLoanInterestYearAction(
  loanId: string,
  year: number,
  interestEur: number,
): Promise<ActionResult> {
  const user = await requireUser();

  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    return { ok: false, error: "Ungültiges Jahr." };
  }
  if (!Number.isFinite(interestEur) || interestEur < 0) {
    return { ok: false, error: "Ungültiger Zinsbetrag." };
  }

  const loan = await db.query.loans.findFirst({ where: and(eq(loans.id, loanId), isNull(loans.deletedAt)) });
  if (!loan) return { ok: false, error: "Darlehen nicht gefunden." };

  const interestCents = toCents(interestEur);
  const existing = await db.query.loanInterestYears.findFirst({
    where: and(eq(loanInterestYears.loanId, loanId), eq(loanInterestYears.year, year)),
  });

  if (existing) {
    await db.update(loanInterestYears)
      .set({ interestCents, updatedAt: new Date() })
      .where(eq(loanInterestYears.id, existing.id));
    await writeAuditLog({ userId: user.id, action: "loan_interest_year.update", entity: "loan_interest_year", entityId: existing.id, before: existing as Record<string, unknown>, after: { loanId, year, interestCents } });
  } else {
    const id = createId();
    await db.insert(loanInterestYears).values({ id, loanId, year, interestCents });
    await writeAuditLog({ userId: user.id, action: "loan_interest_year.create", entity: "loan_interest_year", entityId: id, after: { loanId, year, interestCents } });
  }

  revalidatePath(`/loans/${loanId}`);
  return { ok: true };
}

export async function deleteLoanInterestYearAction(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const entry = await db.query.loanInterestYears.findFirst({ where: eq(loanInterestYears.id, id) });
  if (!entry) return { ok: false, error: "Eintrag nicht gefunden." };

  await db.delete(loanInterestYears).where(eq(loanInterestYears.id, id));
  await writeAuditLog({ userId: user.id, action: "loan_interest_year.delete", entity: "loan_interest_year", entityId: id, before: entry as Record<string, unknown> });

  revalidatePath(`/loans/${entry.loanId}`);
  return { ok: true };
}

async function insertLoanPayments(
  loanId: string,
  userId: string,
  startDueDate: string,
  startBalanceCents: number,
  interestRateBps: number,
  monthlyPaymentCents: number,
  maxMonths: number,
  loanType: string = "annuity",
): Promise<number> {
  let currentDueDate = startDueDate;
  let balanceCents = startBalanceCents;
  let created = 0;

  for (let i = 0; i < maxMonths; i++) {
    if (loanType !== "interest_only" && balanceCents <= 0) break;

    const interestCents = calcInterestCents(balanceCents, interestRateBps);
    let principalCents: number;
    let totalCents: number;

    if (loanType === "interest_only") {
      // Vorfinanzierung: nur Zinsen, keine Tilgung
      principalCents = 0;
      totalCents = interestCents;
    } else {
      principalCents = Math.min(monthlyPaymentCents - interestCents, balanceCents);
      totalCents = interestCents + principalCents;
    }
    const balanceAfterCents = balanceCents - principalCents;

    const id = createId();
    await db.insert(loanPayments).values({ id, loanId, dueDate: currentDueDate, totalCents, interestCents, principalCents, balanceAfterCents });
    await writeAuditLog({ userId, action: "loan_payment.generate", entity: "loan_payment", entityId: id, after: { loanId, dueDate: currentDueDate, interestCents, principalCents } });

    balanceCents = balanceAfterCents;
    currentDueDate = nextMonthStart(currentDueDate);
    created++;
  }

  return created;
}

export async function generateLoanPaymentsAction(loanId: string, months = 12): Promise<GenerateResult> {
  const user = await requireUser();

  const loan = await db.query.loans.findFirst({
    where: and(eq(loans.id, loanId), isNull(loans.deletedAt)),
    with: { loanPayments: { where: isNull(loanPayments.deletedAt), orderBy: [desc(loanPayments.dueDate)], limit: 1 } },
  });
  if (!loan) return { ok: false, error: "Darlehen nicht gefunden." };

  const lastPayment = loan.loanPayments[0];
  const startDueDate = lastPayment ? nextMonthStart(lastPayment.dueDate) : loan.balanceDate.slice(0, 8) + "01";
  const startBalance = lastPayment ? lastPayment.balanceAfterCents : loan.balanceCents;

  const created = await insertLoanPayments(loanId, user.id, startDueDate, startBalance, loan.interestRateBps, loan.monthlyPaymentCents, months, loan.loanType);

  revalidatePath(`/loans/${loanId}`);
  return { ok: true, created };
}

// Generiert den vollständigen Tilgungsplan bis Restschuld = 0 (max. 600 Monate Sicherheitslimit).
export async function generateFullLoanPaymentsAction(loanId: string): Promise<GenerateResult> {
  const user = await requireUser();

  const loan = await db.query.loans.findFirst({
    where: and(eq(loans.id, loanId), isNull(loans.deletedAt)),
    with: { loanPayments: { where: isNull(loanPayments.deletedAt), orderBy: [desc(loanPayments.dueDate)], limit: 1 } },
  });
  if (!loan) return { ok: false, error: "Darlehen nicht gefunden." };

  if (loan.loanType !== "interest_only") {
    const monthlyInterest = calcInterestCents(loan.balanceCents, loan.interestRateBps);
    if (loan.monthlyPaymentCents <= monthlyInterest) {
      return { ok: false, error: "Rate deckt nicht einmal die Zinsen – Tilgungsplan nicht berechenbar." };
    }
  }

  const lastPayment = loan.loanPayments[0];
  const startDueDate = lastPayment ? nextMonthStart(lastPayment.dueDate) : loan.balanceDate.slice(0, 8) + "01";
  const startBalance = lastPayment ? lastPayment.balanceAfterCents : loan.balanceCents;

  // Vorfinanzierung: nur bis zur Zuteilung des verknüpften Bausparvertrags generieren (falls vorhanden), sonst 24 Monate
  let maxMonths = 600;
  if (loan.loanType === "interest_only") {
    maxMonths = 24;
  }

  const created = await insertLoanPayments(loanId, user.id, startDueDate, startBalance, loan.interestRateBps, loan.monthlyPaymentCents, maxMonths, loan.loanType);

  revalidatePath(`/loans/${loanId}`);
  return { ok: true, created };
}

// Soft-löscht alle unbezahlten Raten ab heute, damit der Plan neu generiert werden kann.
export async function resetFutureLoanPaymentsAction(loanId: string): Promise<ActionResult> {
  const user = await requireUser();

  const loan = await db.query.loans.findFirst({ where: and(eq(loans.id, loanId), isNull(loans.deletedAt)) });
  if (!loan) return { ok: false, error: "Darlehen nicht gefunden." };

  const today = todayLocal();

  const toDelete = await db.query.loanPayments.findMany({
    where: and(eq(loanPayments.loanId, loanId), isNull(loanPayments.deletedAt), isNull(loanPayments.paidAt), gt(loanPayments.dueDate, today)),
  });

  if (toDelete.length > 0) {
    await db
      .update(loanPayments)
      .set({ deletedAt: new Date() })
      .where(and(eq(loanPayments.loanId, loanId), isNull(loanPayments.deletedAt), isNull(loanPayments.paidAt), gt(loanPayments.dueDate, today)));

    await writeAuditLog({ userId: user.id, action: "loan_payment.reset", entity: "loan", entityId: loanId, after: { deletedCount: toDelete.length } });
  }

  revalidatePath(`/loans/${loanId}`);
  return { ok: true };
}

export async function markLoanPaymentPaidAction(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const payment = await db.query.loanPayments.findFirst({ where: eq(loanPayments.id, id) });
  if (!payment || payment.deletedAt) return { ok: false, error: "Rate nicht gefunden." };

  const paidAt = todayLocal();
  await db.update(loanPayments).set({ paidAt, updatedAt: new Date() }).where(eq(loanPayments.id, id));

  await db
    .update(loans)
    .set({ balanceCents: payment.balanceAfterCents, balanceDate: payment.dueDate, updatedAt: new Date() })
    .where(eq(loans.id, payment.loanId));

  await writeAuditLog({ userId: user.id, action: "loan_payment.paid", entity: "loan_payment", entityId: id, before: payment as Record<string, unknown>, after: { paidAt } });

  revalidatePath(`/loans/${payment.loanId}`);
  revalidatePath("/loans");
  return { ok: true };
}

// Zuteilung eines Bausparvertrags durchführen: wandelt das Bausparvertrag-Darlehen
// in ein Annuitätendarlehen mit den vereinbarten Konditionen um (Restschuld =
// Bausparsumme − Sparguthaben) und löst die ggf. verknüpfte Vorfinanzierung ab.
export async function executeBausparAllocationAction(loanId: string): Promise<ActionResult> {
  const user = await requireUser();

  const bauspar = await db.query.loans.findFirst({ where: and(eq(loans.id, loanId), isNull(loans.deletedAt)) });
  if (!bauspar) return { ok: false, error: "Darlehen nicht gefunden." };
  if (bauspar.loanType !== "bauspar") return { ok: false, error: "Nur für Bausparverträge möglich." };
  if (bauspar.bsTotalSumCents == null) return { ok: false, error: "Bausparsumme fehlt." };
  if (bauspar.bsLoanInterestBps == null) return { ok: false, error: "Sollzins der Darlehensphase fehlt." };
  if (bauspar.bsLoanMonthlyPaymentCents == null) return { ok: false, error: "Rate nach Zuteilung fehlt." };

  const savings = bauspar.bsSavingsBalanceCents ?? 0;
  const newBalanceCents = Math.max(0, bauspar.bsTotalSumCents - savings);
  const today = todayLocal();

  // Bauspar → Annuität umwandeln
  await db
    .update(loans)
    .set({
      loanType: "annuity",
      balanceCents: newBalanceCents,
      balanceDate: today,
      interestRateBps: bauspar.bsLoanInterestBps,
      monthlyPaymentCents: bauspar.bsLoanMonthlyPaymentCents,
      // Sparphasen-Felder leeren (historisch erhalten in Audit-Log)
      bsSavingsBalanceCents: 0,
      updatedAt: new Date(),
    })
    .where(eq(loans.id, loanId));

  await writeAuditLog({
    userId: user.id,
    action: "loan.bauspar_allocation",
    entity: "loan",
    entityId: loanId,
    before: bauspar as Record<string, unknown>,
    after: { newBalanceCents, savingsUsedCents: savings },
  });

  // Verknüpfte Vorfinanzierung ablösen: Restschuld auf 0, Stichtag = heute
  const linkedFinancing = await db.query.loans.findFirst({
    where: and(eq(loans.replacedByLoanId, loanId), isNull(loans.deletedAt)),
  });
  if (linkedFinancing) {
    await db
      .update(loans)
      .set({ balanceCents: 0, balanceDate: today, updatedAt: new Date() })
      .where(eq(loans.id, linkedFinancing.id));
    await writeAuditLog({
      userId: user.id,
      action: "loan.replaced_by_bauspar",
      entity: "loan",
      entityId: linkedFinancing.id,
      before: linkedFinancing as Record<string, unknown>,
      after: { paidOffBy: loanId, paidOffAt: today },
    });
  }

  revalidatePath(`/loans/${loanId}`);
  revalidatePath("/loans");
  if (linkedFinancing) revalidatePath(`/loans/${linkedFinancing.id}`);
  return { ok: true };
}

export async function getLoanAnalyticsAction() {
  await requireUser();
  return db.query.loans.findMany({
    where: isNull(loans.deletedAt),
    orderBy: [asc(loans.balanceDate)],
    with: {
      property: true,
      loanPayments: {
        where: isNull(loanPayments.deletedAt),
        orderBy: [asc(loanPayments.dueDate)],
      },
    },
  });
}

export async function getLoanInterestByYearAction(year: number) {
  await requireUser();
  const prefix = `${year}-`;
  const rows = await db.query.loanPayments.findMany({
    where: and(isNull(loanPayments.deletedAt), lte(loanPayments.dueDate, `${year}-12-31`)),
    with: { loan: { with: { property: true } } },
  });
  return rows.filter((r) => r.dueDate.startsWith(prefix));
}
