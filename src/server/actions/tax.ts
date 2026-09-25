"use server";

import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { properties, propertyDepreciationItems, paymentReceipts, loanPayments, loanInterestYears, expenses, loans, nkAbrechnungVacancy, nkAbrechnungen } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { calcAnlageV, buildLoanInterestPayments, receiptsToAnlageVPayments, depreciationItemsSumForYear, type AnlageVErgebnis } from "@/lib/tax/anlage-v";

export async function getAnlageVAction(propertyId: string, year: number): Promise<AnlageVErgebnis | null> {
  await requireUser();

  const property = await db.query.properties.findFirst({
    where: and(eq(properties.id, propertyId), isNull(properties.deletedAt)),
  });

  if (!property) return null;

  const yearStr = String(year);

  const afaItems = await db.query.propertyDepreciationItems.findMany({
    where: and(eq(propertyDepreciationItems.propertyId, propertyId), isNull(propertyDepreciationItems.deletedAt)),
  });

  // Zahlungseingänge des Objekts mit Eingangsdatum im Jahr (Zuflussprinzip, § 11 EStG).
  // Jede Teilzahlung zählt in ihrem eigenen Jahr — auch über den Jahreswechsel.
  const yearReceipts = await db.query.paymentReceipts.findMany({
    where: and(
      isNull(paymentReceipts.deletedAt),
      gte(paymentReceipts.receivedAt, `${yearStr}-01-01`),
      lte(paymentReceipts.receivedAt, `${yearStr}-12-31`),
    ),
    with: { lease: { with: { unit: true } }, payment: true },
  });
  const propertyReceipts = yearReceipts.filter(
    (r) => r.lease.unit.propertyId === propertyId && (r.kind !== "rent" || (r.payment != null && r.payment.deletedAt == null)),
  );
  const propertyPayments = receiptsToAnlageVPayments(
    propertyReceipts.map((r) => ({ kind: r.kind, amountCents: r.amountCents, receivedAt: r.receivedAt, payment: r.payment })),
  );

  // Loan payments des Objekts mit dueDate im Jahr
  const propertyLoans = await db.query.loans.findMany({
    where: and(eq(loans.propertyId, propertyId), isNull(loans.deletedAt)),
  });
  const loanIds = new Set(propertyLoans.map((l) => l.id));

  const yearLoanPayments = loanIds.size > 0
    ? (await db.query.loanPayments.findMany({ where: isNull(loanPayments.deletedAt) }))
        .filter((lp) => loanIds.has(lp.loanId) && lp.dueDate.startsWith(yearStr))
    : [];

  // Manuell erfasste Jahres-Schuldzinsen (Zinsbescheinigung) haben Vorrang vor den
  // aus dem Tilgungsplan berechneten Zinsen — pro Darlehen entschieden.
  const manualInterest = loanIds.size > 0
    ? (await db.query.loanInterestYears.findMany({ where: eq(loanInterestYears.year, year) }))
        .filter((r) => loanIds.has(r.loanId))
    : [];
  const manualByLoan = new Map(manualInterest.map((r) => [r.loanId, r.interestCents]));

  const propertyLoanPayments = buildLoanInterestPayments(
    propertyLoans.map((l) => ({
      loanPayments: yearLoanPayments.filter((lp) => lp.loanId === l.id),
      manualInterestCents: manualByLoan.has(l.id) ? manualByLoan.get(l.id)! : null,
    })),
    year,
  );

  // Ausgaben: direkt zugeordnet oder anteilig (propertyId = null)
  const allExpenses = await db.query.expenses.findMany({
    where: isNull(expenses.deletedAt),
  });
  const allProperties = await db.query.properties.findMany({
    where: isNull(properties.deletedAt),
  });
  const propertyCount = Math.max(allProperties.length, 1);

  const propertyExpenses = allExpenses
    .filter((e) => e.date.startsWith(yearStr))
    .flatMap((e) => {
      if (e.propertyId === propertyId)
        return [{ category: e.category, amountCents: e.amountCents }];
      if (e.propertyId === null)
        return [{ category: e.category, amountCents: Math.round(e.amountCents / propertyCount) }];
      return [];
    });

  // Leerstand-Anteile aus NK-Abrechnungen des Jahres + Objekts (informativ).
  // Werbungskosten ändert das nicht — die Gesamtkosten waren schon drin —, aber
  // wir können den Leerstand-Anteil auf der Anlage V separat ausweisen.
  const nkAbrsForYear = await db.query.nkAbrechnungen.findMany({
    where: and(
      eq(nkAbrechnungen.propertyId, propertyId),
      eq(nkAbrechnungen.year, year),
      isNull(nkAbrechnungen.deletedAt),
    ),
  });
  const vacancyByCategory = new Map<string, number>();
  let vacancyTotal = 0;
  for (const a of nkAbrsForYear) {
    const rows = await db.query.nkAbrechnungVacancy.findMany({
      where: eq(nkAbrechnungVacancy.abrechnungId, a.id),
    });
    for (const v of rows) {
      vacancyByCategory.set(v.category, (vacancyByCategory.get(v.category) ?? 0) + v.vacancyShareCents);
      vacancyTotal += v.vacancyShareCents;
    }
  }

  return calcAnlageV({
    propertyId,
    year,
    purchasePriceTotal: property.purchasePriceTotal,
    purchasePriceLand: property.purchasePriceLand,
    depreciationPermille: property.depreciationPermille,
    // AfA-Posten (wie ELSTER Zeile 33) haben Vorrang; sonst Altfeld, sonst Berechnung
    afaOverrideCents: depreciationItemsSumForYear(afaItems, year) ?? property.depreciationOverrideCents,
    payments: propertyPayments,
    loanPayments: propertyLoanPayments,
    expenses: propertyExpenses,
    vacancyByCategory: Object.fromEntries(vacancyByCategory),
    vacancyTotal,
  });
}

// Frühestes steuerlich relevantes Jahr eines Objekts: Anschaffung, erster
// Mietvertrag oder erste Ausgabe — je nachdem, was früher liegt.
export async function getTaxEarliestYearAction(propertyId: string): Promise<number | null> {
  await requireUser();

  const property = await db.query.properties.findFirst({
    where: and(eq(properties.id, propertyId), isNull(properties.deletedAt)),
    with: { units: { with: { leases: true } } },
  });
  if (!property) return null;

  const candidates: string[] = [];
  if (property.purchaseDate) candidates.push(property.purchaseDate);
  for (const u of property.units) {
    for (const l of u.leases) {
      if (!l.deletedAt) candidates.push(l.startDate);
    }
  }
  const firstExpense = await db.query.expenses.findFirst({
    where: and(eq(expenses.propertyId, propertyId), isNull(expenses.deletedAt)),
    orderBy: (e, { asc }) => [asc(e.date)],
  });
  if (firstExpense) candidates.push(firstExpense.date);

  const years = candidates.map((d) => parseInt(d.slice(0, 4), 10)).filter((y) => Number.isFinite(y));
  return years.length > 0 ? Math.min(...years) : null;
}

export async function getTaxPropertiesAction() {
  await requireUser();
  return db.query.properties.findMany({
    where: isNull(properties.deletedAt),
    orderBy: (p, { asc }) => [asc(p.city), asc(p.street)],
  });
}
