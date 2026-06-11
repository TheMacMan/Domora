"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { properties, payments, loanPayments, expenses, loans, nkAbrechnungVacancy, nkAbrechnungen } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { calcAnlageV, type AnlageVErgebnis } from "@/lib/tax/anlage-v";

export async function getAnlageVAction(propertyId: string, year: number): Promise<AnlageVErgebnis | null> {
  await requireUser();

  const property = await db.query.properties.findFirst({
    where: and(eq(properties.id, propertyId), isNull(properties.deletedAt)),
  });

  if (!property) return null;

  const yearStr = String(year);

  // Alle Payments des Objekts mit paidAt im Jahr (Zufluss-Prinzip)
  const allPayments = await db.query.payments.findMany({
    where: isNull(payments.deletedAt),
    with: { lease: { with: { unit: true } } },
  });
  const propertyPayments = allPayments.filter(
    (p) => p.lease.unit.propertyId === propertyId && p.paidAt?.startsWith(yearStr)
  );

  // Loan payments des Objekts mit dueDate im Jahr
  const propertyLoans = await db.query.loans.findMany({
    where: and(eq(loans.propertyId, propertyId), isNull(loans.deletedAt)),
  });
  const loanIds = new Set(propertyLoans.map((l) => l.id));

  const propertyLoanPayments = loanIds.size > 0
    ? (await db.query.loanPayments.findMany({ where: isNull(loanPayments.deletedAt) }))
        .filter((lp) => loanIds.has(lp.loanId) && lp.dueDate.startsWith(yearStr))
    : [];

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
    payments: propertyPayments,
    loanPayments: propertyLoanPayments,
    expenses: propertyExpenses,
    vacancyByCategory: Object.fromEntries(vacancyByCategory),
    vacancyTotal,
  });
}

export async function getTaxPropertiesAction() {
  await requireUser();
  return db.query.properties.findMany({
    where: isNull(properties.deletedAt),
    orderBy: (p, { asc }) => [asc(p.city), asc(p.street)],
  });
}
