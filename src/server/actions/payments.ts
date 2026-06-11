"use server";

import { todayLocal } from "@/lib/dates";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull, lte, or, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leases, payments, rentAdjustments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { effectiveRentAt } from "@/lib/rent";

type ActionResult = { ok: true; created?: number } | { ok: false; error: string };

// Erzeugt Soll-Einträge für alle aktiven Mietverträge eines Monats (YYYY-MM).
export async function generatePaymentsAction(yearMonth: string): Promise<ActionResult> {
  const user = await requireUser();

  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return { ok: false, error: "Ungültiger Monat." };

  const monthStart = `${yearMonth}-01`;

  const activeLeases = await db.query.leases.findMany({
    where: and(
      isNull(leases.deletedAt),
      lte(leases.startDate, monthStart),
      or(isNull(leases.endDate), gte(leases.endDate, monthStart))
    ),
    with: { rentComponents: true },
  });

  let created = 0;
  for (const lease of activeLeases) {
    const existing = await db.query.payments.findFirst({
      where: and(
        eq(payments.leaseId, lease.id),
        eq(payments.dueDate, monthStart),
        isNull(payments.deletedAt)
      ),
    });
    if (existing) continue;

    // Effektive Miete (Kalt + NK) zum Stichtag — NK wird carried-forward, wenn
    // die letzte Anpassung sie nicht explizit gesetzt hat
    const allAdjustments = await db.query.rentAdjustments.findMany({
      where: and(eq(rentAdjustments.leaseId, lease.id), isNull(rentAdjustments.deletedAt)),
    });
    const { rentCents: baseRent, serviceChargesCents: effectiveSC } = effectiveRentAt(lease, allAdjustments, monthStart);

    // Zusätzliche Mietkomponenten (Garage, Stellplatz, Küche, …) als Kalt-Anteil mitnehmen
    const componentsCents = lease.rentComponents.reduce((s, c) => s + c.amountCents, 0);

    const id = createId();
    await db.insert(payments).values({
      id,
      leaseId: lease.id,
      dueDate: monthStart,
      rentCents: baseRent + componentsCents,
      serviceChargesCents: effectiveSC,
    });
    await writeAuditLog({ userId: user.id, action: "payment.generate", entity: "payment", entityId: id, after: { leaseId: lease.id, dueDate: monthStart } });
    created++;
  }

  revalidatePath("/payments");
  return { ok: true, created };
}

export async function markAsPaidAction(id: string, paidAt?: string): Promise<ActionResult> {
  const user = await requireUser();

  const payment = await db.query.payments.findFirst({ where: eq(payments.id, id) });
  if (!payment || payment.deletedAt) return { ok: false, error: "Zahlung nicht gefunden." };

  // Default: dueDate (= Periodenanfang) statt heute, weil Mieten typischerweise
  // zum Monatsanfang gezahlt werden. Aufrufer können explizit ein Datum setzen.
  const effectivePaidAt = paidAt ?? payment.dueDate ?? todayLocal();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectivePaidAt)) return { ok: false, error: "Ungültiges Datum." };

  const paidCents = payment.rentCents + (payment.serviceChargesCents ?? 0);

  await db.update(payments).set({ paidCents, paidAt: effectivePaidAt, updatedAt: new Date() }).where(eq(payments.id, id));

  await writeAuditLog({ userId: user.id, action: "payment.paid", entity: "payment", entityId: id, before: payment as Record<string, unknown>, after: { paidCents, paidAt: effectivePaidAt } });

  revalidatePath("/payments");
  return { ok: true };
}

// Teilzahlung erfassen: addiert den Betrag zum bestehenden paidCents.
// Sobald die Summe ≥ Soll erreicht, gilt der Eintrag als vollständig bezahlt.
export async function addPartialPaymentAction(
  id: string,
  amountCents: number,
  receivedAt: string,
): Promise<ActionResult> {
  const user = await requireUser();

  if (!Number.isFinite(amountCents) || amountCents <= 0) return { ok: false, error: "Betrag muss > 0 sein." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedAt)) return { ok: false, error: "Ungültiges Datum." };

  const payment = await db.query.payments.findFirst({ where: eq(payments.id, id) });
  if (!payment || payment.deletedAt) return { ok: false, error: "Zahlung nicht gefunden." };

  const currentPaid = payment.paidCents ?? 0;
  const newPaid = currentPaid + amountCents;

  await db.update(payments).set({ paidCents: newPaid, paidAt: receivedAt, updatedAt: new Date() }).where(eq(payments.id, id));

  await writeAuditLog({
    userId: user.id,
    action: "payment.partial",
    entity: "payment",
    entityId: id,
    before: payment as Record<string, unknown>,
    after: { addedCents: amountCents, newPaidCents: newPaid, receivedAt },
  });

  revalidatePath("/payments");
  return { ok: true };
}

// Löscht alle noch unbezahlten (paid_at IS NULL) Payments per Soft-Delete.
// Bezahlte Einträge bleiben unangetastet (Historie / Buchungsbeleg).
export async function deleteAllUnpaidPaymentsAction(): Promise<ActionResult & { deleted?: number }> {
  const user = await requireUser();

  const toDelete = await db.query.payments.findMany({
    where: and(isNull(payments.deletedAt), isNull(payments.paidAt)),
  });
  if (toDelete.length === 0) {
    return { ok: true, deleted: 0 };
  }

  await db
    .update(payments)
    .set({ deletedAt: new Date() })
    .where(and(isNull(payments.deletedAt), isNull(payments.paidAt)));

  await writeAuditLog({
    userId: user.id,
    action: "payment.bulk_delete_unpaid",
    entity: "payment",
    after: { deletedCount: toDelete.length },
  });

  revalidatePath("/payments");
  return { ok: true, deleted: toDelete.length };
}

// Setzt eine Zahlung zurück auf "offen" (paidCents + paidAt → null), z.B. nach
// versehentlicher Markierung. Notizen bleiben erhalten.
export async function markAsUnpaidAction(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const payment = await db.query.payments.findFirst({ where: eq(payments.id, id) });
  if (!payment || payment.deletedAt) return { ok: false, error: "Zahlung nicht gefunden." };

  await db.update(payments).set({ paidCents: null, paidAt: null, updatedAt: new Date() }).where(eq(payments.id, id));

  await writeAuditLog({ userId: user.id, action: "payment.unpaid", entity: "payment", entityId: id, before: payment as Record<string, unknown>, after: { paidCents: null, paidAt: null } });

  revalidatePath("/payments");
  return { ok: true };
}

export async function updatePaymentAction(
  id: string,
  data: { paidCents: number | null; paidAt: string | null; notes: string | null }
): Promise<ActionResult> {
  const user = await requireUser();

  const before = await db.query.payments.findFirst({ where: eq(payments.id, id) });
  if (!before || before.deletedAt) return { ok: false, error: "Zahlung nicht gefunden." };

  await db.update(payments).set({ ...data, updatedAt: new Date() }).where(eq(payments.id, id));

  await writeAuditLog({ userId: user.id, action: "payment.update", entity: "payment", entityId: id, before: before as Record<string, unknown>, after: data });

  revalidatePath("/payments");
  return { ok: true };
}

export async function deletePaymentAction(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const payment = await db.query.payments.findFirst({ where: eq(payments.id, id) });
  if (!payment || payment.deletedAt) return { ok: false, error: "Zahlung nicht gefunden." };

  await db.update(payments).set({ deletedAt: new Date() }).where(eq(payments.id, id));

  await writeAuditLog({ userId: user.id, action: "payment.delete", entity: "payment", entityId: id, before: payment as Record<string, unknown> });

  revalidatePath("/payments");
  return { ok: true };
}

export async function getPaymentAction(id: string) {
  await requireUser();
  return db.query.payments.findFirst({
    where: eq(payments.id, id),
    with: {
      lease: {
        with: {
          unit: { with: { property: true } },
          leaseTenants: { with: { tenant: true }, orderBy: (lt, { asc }) => [asc(lt.sortOrder)] },
        },
      },
    },
  });
}

export async function getPaymentsByMonthAction(yearMonth: string) {
  await requireUser();
  const monthStart = `${yearMonth}-01`;
  return db.query.payments.findMany({
    where: and(eq(payments.dueDate, monthStart), isNull(payments.deletedAt)),
    orderBy: (p, { asc }) => [asc(p.dueDate)],
    with: {
      lease: {
        with: {
          unit: { with: { property: true } },
          leaseTenants: { with: { tenant: true }, orderBy: (lt, { asc }) => [asc(lt.sortOrder)] },
        },
      },
    },
  });
}

export async function getOpenPaymentsAction() {
  await requireUser();
  const today = todayLocal();
  return db.query.payments.findMany({
    where: and(
      isNull(payments.deletedAt),
      isNull(payments.paidAt),
      // dueDate < today (string comparison works for ISO dates)
    ),
    orderBy: (p, { asc }) => [asc(p.dueDate)],
    with: {
      lease: {
        with: {
          unit: { with: { property: true } },
          leaseTenants: { with: { tenant: true }, orderBy: (lt, { asc }) => [asc(lt.sortOrder)] },
        },
      },
    },
  }).then((rows) => rows.filter((r) => r.dueDate < today));
}
