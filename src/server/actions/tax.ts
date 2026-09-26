"use server";

import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { properties, propertyDepreciationItems, paymentReceipts, loanPayments, loanInterestYears, expenses, loans, nkAbrechnungVacancy, nkAbrechnungen } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { calcAnlageV, calcAfA, buildLoanInterestPayments, receiptsToAnlageVPayments, depreciationItemsSumForYear, type AnlageVErgebnis } from "@/lib/tax/anlage-v";
import { buildElsterAnlageV, type ElsterAnlageV } from "@/lib/tax/elster";

// Alle steuerlich relevanten Daten eines Objekts für ein Jahr — gemeinsame Basis
// für die Anlage-V-Übersicht und die ELSTER-Ansicht (identische Auswahl).
async function loadTaxYearData(propertyId: string, year: number) {
  const property = await db.query.properties.findFirst({
    where: and(eq(properties.id, propertyId), isNull(properties.deletedAt)),
  });

  if (!property) return null;

  const yearStr = String(year);

  const afaItems = await db.query.propertyDepreciationItems.findMany({
    where: and(eq(propertyDepreciationItems.propertyId, propertyId), isNull(propertyDepreciationItems.deletedAt)),
    orderBy: (d, { asc }) => [asc(d.createdAt)],
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

  const loansWithInterest = propertyLoans.map((l) => ({
    loan: l,
    loanPayments: yearLoanPayments.filter((lp) => lp.loanId === l.id),
    manualInterestCents: manualByLoan.has(l.id) ? manualByLoan.get(l.id)! : null,
  }));

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
        return [{ category: e.category, amountCents: e.amountCents, date: e.date, description: e.description }];
      if (e.propertyId === null)
        return [{
          category: e.category,
          amountCents: Math.round(e.amountCents / propertyCount),
          date: e.date,
          description: `${e.description ?? "(ohne Beschreibung)"} (anteilig 1/${propertyCount})`,
        }];
      return [];
    });

  return { property, afaItems, propertyReceipts, loansWithInterest, propertyExpenses };
}

export async function getAnlageVAction(propertyId: string, year: number): Promise<AnlageVErgebnis | null> {
  await requireUser();

  const data = await loadTaxYearData(propertyId, year);
  if (!data) return null;
  const { property, afaItems, propertyReceipts, loansWithInterest, propertyExpenses } = data;

  const propertyPayments = receiptsToAnlageVPayments(
    propertyReceipts.map((r) => ({ kind: r.kind, amountCents: r.amountCents, receivedAt: r.receivedAt, payment: r.payment })),
  );

  const propertyLoanPayments = buildLoanInterestPayments(loansWithInterest, year);

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

// Anlage V in der Zeilenstruktur des ELSTER-Formulars (zum Übertragen).
export async function getElsterAnlageVAction(propertyId: string, year: number): Promise<ElsterAnlageV | null> {
  await requireUser();

  const data = await loadTaxYearData(propertyId, year);
  if (!data) return null;
  const { property, afaItems, propertyReceipts, loansWithInterest, propertyExpenses } = data;

  // Einnahmen je Wohneinheit — gleiche Aufteilung Kalt/NK wie calcAnlageV
  // (Verhältnis zum Monats-Soll, gerundet je Zahlungseingang).
  const rentByUnit = new Map<string, number>();
  let umlagenLaufendCents = 0;
  let nkAbrechnungCents = 0;
  for (const r of propertyReceipts) {
    if (r.amountCents === 0) continue;
    if (r.kind === "nk_settlement") {
      nkAbrechnungCents += r.amountCents;
      continue;
    }
    if (!r.payment) continue;
    const sc = r.payment.serviceChargesCents ?? 0;
    const soll = r.payment.rentCents + sc;
    if (soll === 0) continue;
    const ratio = r.amountCents / soll;
    const unitName = r.lease.unit.name;
    rentByUnit.set(unitName, (rentByUnit.get(unitName) ?? 0) + Math.round(r.payment.rentCents * ratio));
    umlagenLaufendCents += Math.round(sc * ratio);
  }

  const validAfaItems = afaItems.filter(
    (i) => (i.fromYear == null || i.fromYear <= year) && (i.toYear == null || i.toYear >= year),
  );
  const afaFallbackCents = afaItems.length === 0
    ? property.depreciationOverrideCents ?? calcAfA(property.purchasePriceTotal, property.purchasePriceLand, property.depreciationPermille)
    : null;

  const result = buildElsterAnlageV({
    year,
    property: {
      street: property.street,
      postalCode: property.postalCode,
      city: property.city,
      purchaseDate: property.purchaseDate,
    },
    rentByUnit: [...rentByUnit.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "de"))
      .map(([unitName, cents]) => ({ unitName, cents })),
    umlagenLaufendCents,
    nkAbrechnungCents,
    afaItems: validAfaItems.map((i) => ({
      method: i.method,
      rateBps: i.rateBps,
      basisMode: i.basisMode,
      explanation: i.explanation,
      annualCents: i.annualCents,
    })),
    afaFallbackCents,
    loans: loansWithInterest.map(({ loan, loanPayments: lps, manualInterestCents }) => ({
      label: loan.contractNumber ? `${loan.description} (Vertrag ${loan.contractNumber})` : loan.description,
      interestCents: manualInterestCents ?? lps.reduce((s, lp) => s + lp.interestCents, 0),
    })),
    expenses: propertyExpenses.map((e) => ({
      category: e.category,
      cents: e.amountCents,
      date: e.date,
      description: e.description,
    })),
  });

  // Gegenprobe mit der Anlage-V-Übersicht (Herstellungsaufwand ist dort enthalten, hier nicht)
  const ergebnis = await getAnlageVAction(propertyId, year);
  if (ergebnis) {
    const expectedWk = ergebnis.werbungskosten.gesamtCents - ergebnis.werbungskosten.kapitalaufwandCents;
    if (ergebnis.einnahmen.gesamtCents !== result.summeEinnahmen.cents || expectedWk !== result.summeWerbungskosten.cents) {
      result.warnings.unshift({
        text: "Die Summen weichen von der Anlage-V-Übersicht ab. Bitte die Zuordnung prüfen, bevor du die Werte überträgst.",
      });
    }
  }

  return result;
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
