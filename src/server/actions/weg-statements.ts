"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { wegAbrechnungen, expenses, properties } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { toCents } from "@/lib/money";
import { writeAuditLog } from "@/lib/audit";
import type { ExpenseCategory } from "@/lib/expense";

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

export type WegPositionInput = {
  category: ExpenseCategory;
  description?: string | null;
  amountEur: number;
};

export type WegAbrechnungInput = {
  propertyId: string;
  year: number;
  abrechnungsDatum: string;        // YYYY-MM-DD
  positions: WegPositionInput[];
  notes?: string | null;
};

// Ermittelt die Σ Hausgeld-Vorauszahlungen (Kategorie weg_hausgeld) für ein
// bestimmtes Property und Jahr. Wird beim Anlegen einer WEG-Abrechnung als
// Snapshot gespeichert UND vor dem Anlegen als Vorschau angezeigt.
export async function getHausgeldSumAction(propertyId: string, year: number): Promise<number> {
  await requireUser();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const rows = await db.query.expenses.findMany({
    where: and(
      isNull(expenses.deletedAt),
      eq(expenses.propertyId, propertyId),
      eq(expenses.category, "weg_hausgeld"),
      gte(expenses.date, yearStart),
      lte(expenses.date, yearEnd),
    ),
  });
  return rows.reduce((s, r) => s + r.amountCents, 0);
}

export async function createWegAbrechnungAction(input: WegAbrechnungInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  if (!Number.isFinite(input.year) || input.year < 2000 || input.year > 2100) return { ok: false, error: "Ungültiges Jahr." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.abrechnungsDatum)) return { ok: false, error: "Ungültiges Datum." };
  if (input.positions.length === 0) return { ok: false, error: "Keine Positionen erfasst." };

  const property = await db.query.properties.findFirst({
    where: and(eq(properties.id, input.propertyId), isNull(properties.deletedAt)),
  });
  if (!property) return { ok: false, error: "Objekt nicht gefunden." };

  // Konflikt-Check: gibt es schon eine WEG-Abrechnung für dieses Objekt+Jahr?
  const existing = await db.query.wegAbrechnungen.findFirst({
    where: and(
      eq(wegAbrechnungen.propertyId, input.propertyId),
      eq(wegAbrechnungen.year, input.year),
      isNull(wegAbrechnungen.deletedAt),
    ),
  });
  if (existing) return { ok: false, error: `Für ${input.year} existiert bereits eine WEG-Abrechnung für dieses Objekt.` };

  // Hausgeld-Vorauszahlungen des Jahres
  const hausgeldVorausz = await getHausgeldSumAction(input.propertyId, input.year);

  // Posten-Summe
  const positionsSum = input.positions.reduce((s, p) => s + toCents(p.amountEur), 0);
  const saldo = positionsSum - hausgeldVorausz;

  const abrId = createId();
  const yearStart = `${input.year}-01-01`;
  const yearEnd = `${input.year}-12-31`;

  await db.insert(wegAbrechnungen).values({
    id: abrId,
    propertyId: input.propertyId,
    year: input.year,
    abrechnungsDatum: input.abrechnungsDatum,
    hausgeldVorauszahlungCents: hausgeldVorausz,
    saldoCents: saldo,
    notes: input.notes ?? null,
  });

  // Einzelposten als Expenses mit wegAbrechnungId und Leistungszeitraum = ganzes Jahr.
  // Datum = Jahresende des Abrechnungsjahres, damit Anlage V (Zuflussprinzip) sie
  // dem wirtschaftlich zugehörigen Jahr zuordnet (Hausgeld-Vorauszahlungen wurden
  // unterjährig 2025 gezahlt — die WEG-Abrechnung 2025 schlüsselt sie nur auf).
  const einzelpostenDatum = yearEnd;
  for (const p of input.positions) {
    if (p.amountEur <= 0) continue;
    await db.insert(expenses).values({
      id: createId(),
      propertyId: input.propertyId,
      category: p.category,
      amountCents: toCents(p.amountEur),
      date: einzelpostenDatum,
      description: p.description?.trim() || null,
      isRecurring: false,
      servicePeriodStart: yearStart,
      servicePeriodEnd: yearEnd,
      wegAbrechnungId: abrId,
    });
  }

  // Saldo als eigene Expense (Kategorie weg_saldo) — zählt im Cashflow, nicht in Anlage V
  if (saldo !== 0) {
    await db.insert(expenses).values({
      id: createId(),
      propertyId: input.propertyId,
      category: "weg_saldo",
      amountCents: Math.abs(saldo),
      date: input.abrechnungsDatum,
      description: `Saldo WEG-Abrechnung ${input.year}${saldo < 0 ? " (Erstattung)" : " (Nachzahlung)"}`,
      isRecurring: false,
      wegAbrechnungId: abrId,
    });
  }

  await writeAuditLog({
    userId: user.id,
    action: "weg_abrechnung.create",
    entity: "weg_abrechnung",
    entityId: abrId,
    after: { propertyId: input.propertyId, year: input.year, saldo, positions: input.positions.length },
  });

  revalidatePath("/weg-statements");
  revalidatePath("/expenses");
  return { ok: true, data: { id: abrId } };
}

export type WegAbrechnungUpdateInput = {
  abrechnungsDatum: string;        // YYYY-MM-DD
  positions: WegPositionInput[];
  notes?: string | null;
};

// Bearbeitet eine bestehende WEG-Abrechnung: Property und Jahr sind fix, alle Positionen werden
// neu geschrieben. Bisherige verknüpfte Expenses (Posten + Saldo) werden soft-gelöscht.
export async function updateWegAbrechnungAction(
  id: string,
  input: WegAbrechnungUpdateInput,
): Promise<ActionResult> {
  const user = await requireUser();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.abrechnungsDatum)) {
    return { ok: false, error: "Ungültiges Datum." };
  }
  if (input.positions.length === 0) {
    return { ok: false, error: "Keine Positionen erfasst." };
  }

  const abr = await db.query.wegAbrechnungen.findFirst({
    where: and(eq(wegAbrechnungen.id, id), isNull(wegAbrechnungen.deletedAt)),
  });
  if (!abr) return { ok: false, error: "WEG-Abrechnung nicht gefunden." };

  // Hausgeld-Vorauszahlungen aktuell neu ermitteln (kann sich geändert haben, wenn
  // nachträglich Buchungen erfasst wurden)
  const hausgeldVorausz = await getHausgeldSumAction(abr.propertyId, abr.year);

  const positionsSum = input.positions.reduce((s, p) => s + toCents(p.amountEur), 0);
  const saldo = positionsSum - hausgeldVorausz;

  const yearStart = `${abr.year}-01-01`;
  const yearEnd = `${abr.year}-12-31`;

  // Alte verknüpfte Expenses soft-deleten
  await db
    .update(expenses)
    .set({ deletedAt: new Date() })
    .where(and(eq(expenses.wegAbrechnungId, id), isNull(expenses.deletedAt)));

  // Neue Positionen schreiben — Datum = Jahresende des Abrechnungsjahres
  const einzelpostenDatum = yearEnd;
  for (const p of input.positions) {
    if (p.amountEur <= 0) continue;
    await db.insert(expenses).values({
      id: createId(),
      propertyId: abr.propertyId,
      category: p.category,
      amountCents: toCents(p.amountEur),
      date: einzelpostenDatum,
      description: p.description?.trim() || null,
      isRecurring: false,
      servicePeriodStart: yearStart,
      servicePeriodEnd: yearEnd,
      wegAbrechnungId: id,
    });
  }

  // Saldo-Expense
  if (saldo !== 0) {
    await db.insert(expenses).values({
      id: createId(),
      propertyId: abr.propertyId,
      category: "weg_saldo",
      amountCents: Math.abs(saldo),
      date: input.abrechnungsDatum,
      description: `Saldo WEG-Abrechnung ${abr.year}${saldo < 0 ? " (Erstattung)" : " (Nachzahlung)"}`,
      isRecurring: false,
      wegAbrechnungId: id,
    });
  }

  await db
    .update(wegAbrechnungen)
    .set({
      abrechnungsDatum: input.abrechnungsDatum,
      hausgeldVorauszahlungCents: hausgeldVorausz,
      saldoCents: saldo,
      notes: input.notes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(wegAbrechnungen.id, id));

  await writeAuditLog({
    userId: user.id,
    action: "weg_abrechnung.update",
    entity: "weg_abrechnung",
    entityId: id,
    after: { saldo, positions: input.positions.length },
  });

  revalidatePath("/weg-statements");
  revalidatePath(`/weg-statements/${id}`);
  revalidatePath("/expenses");
  return { ok: true };
}

export async function listWegAbrechnungenAction() {
  await requireUser();
  return db.query.wegAbrechnungen.findMany({
    where: isNull(wegAbrechnungen.deletedAt),
    orderBy: [desc(wegAbrechnungen.year), asc(wegAbrechnungen.createdAt)],
    with: { property: true },
  });
}

export async function getWegAbrechnungAction(id: string) {
  await requireUser();
  const abr = await db.query.wegAbrechnungen.findFirst({
    where: and(eq(wegAbrechnungen.id, id), isNull(wegAbrechnungen.deletedAt)),
    with: { property: true },
  });
  if (!abr) return null;
  const positions = await db.query.expenses.findMany({
    where: and(eq(expenses.wegAbrechnungId, id), isNull(expenses.deletedAt)),
    orderBy: [asc(expenses.category)],
  });
  return { ...abr, positions };
}

export async function deleteWegAbrechnungAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const abr = await db.query.wegAbrechnungen.findFirst({ where: eq(wegAbrechnungen.id, id) });
  if (!abr || abr.deletedAt) return { ok: false, error: "Nicht gefunden." };

  // Verknüpfte Expenses ebenfalls soft-löschen
  await db
    .update(expenses)
    .set({ deletedAt: new Date() })
    .where(and(eq(expenses.wegAbrechnungId, id), isNull(expenses.deletedAt)));

  await db.update(wegAbrechnungen).set({ deletedAt: new Date() }).where(eq(wegAbrechnungen.id, id));

  await writeAuditLog({ userId: user.id, action: "weg_abrechnung.delete", entity: "weg_abrechnung", entityId: id });
  revalidatePath("/weg-statements");
  revalidatePath("/expenses");
  return { ok: true };
}
