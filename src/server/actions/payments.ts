"use server";

import { todayLocal } from "@/lib/dates";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, isNull, lte, or, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leases, payments, paymentReceipts, rentAdjustments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { effectiveRentAt } from "@/lib/rent";
import { aggregateReceipts, buildRentLedger } from "@/lib/receipts";

type ActionResult = { ok: true; created?: number } | { ok: false; error: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// payments.paidCents/paidAt sind eine automatisch gepflegte Summe der Eingänge.
// Nach jeder Änderung an Eingängen eines Monats neu berechnen.
async function syncPaymentFromReceipts(paymentId: string) {
  const rs = await db.query.paymentReceipts.findMany({
    where: and(eq(paymentReceipts.paymentId, paymentId), isNull(paymentReceipts.deletedAt)),
  });
  const { paidCents, paidAt } = aggregateReceipts(rs);
  await db.update(payments).set({ paidCents, paidAt, updatedAt: new Date() }).where(eq(payments.id, paymentId));
}

async function receivedSumCents(paymentId: string): Promise<number> {
  const rs = await db.query.paymentReceipts.findMany({
    where: and(eq(paymentReceipts.paymentId, paymentId), isNull(paymentReceipts.deletedAt)),
  });
  return rs.reduce((s, r) => s + r.amountCents, 0);
}

function revalidatePaymentViews(leaseId?: string) {
  revalidatePath("/payments");
  revalidatePath("/dashboard");
  if (leaseId) revalidatePath(`/leases/${leaseId}`);
}

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
  if (!DATE_RE.test(effectivePaidAt)) return { ok: false, error: "Ungültiges Datum." };

  // Ein Eingang über den noch offenen Betrag (bei Teilzahlungen nur der Rest)
  const soll = payment.rentCents + (payment.serviceChargesCents ?? 0);
  const openCents = soll - (await receivedSumCents(id));
  if (openCents <= 0) return { ok: true };

  await db.insert(paymentReceipts).values({
    id: createId(), leaseId: payment.leaseId, kind: "rent", paymentId: id, receivedAt: effectivePaidAt, amountCents: openCents,
  });
  await syncPaymentFromReceipts(id);

  await writeAuditLog({ userId: user.id, action: "payment.paid", entity: "payment", entityId: id, before: payment as Record<string, unknown>, after: { addedCents: openCents, receivedAt: effectivePaidAt } });

  revalidatePaymentViews(payment.leaseId);
  return { ok: true };
}

// Erfasst einen einzelnen Zahlungseingang zu einem Monat. Negative Beträge sind
// Rückzahlungen an den Mieter (z. B. Überzahlung).
export async function addReceiptAction(
  paymentId: string,
  amountCents: number,
  receivedAt: string,
  note?: string | null,
): Promise<ActionResult> {
  const user = await requireUser();

  if (!Number.isInteger(amountCents) || amountCents === 0) return { ok: false, error: "Betrag darf nicht 0 sein." };
  if (!DATE_RE.test(receivedAt)) return { ok: false, error: "Ungültiges Datum." };

  const payment = await db.query.payments.findFirst({ where: eq(payments.id, paymentId) });
  if (!payment || payment.deletedAt) return { ok: false, error: "Zahlung nicht gefunden." };

  const id = createId();
  await db.insert(paymentReceipts).values({
    id, leaseId: payment.leaseId, kind: "rent", paymentId, receivedAt, amountCents, note: note?.trim() || null,
  });
  await syncPaymentFromReceipts(paymentId);

  await writeAuditLog({ userId: user.id, action: "receipt.create", entity: "payment_receipt", entityId: id, after: { paymentId, amountCents, receivedAt, note: note ?? null } });

  revalidatePaymentViews(payment.leaseId);
  revalidatePath(`/payments/${paymentId}/edit`);
  return { ok: true };
}

// NK-Nachzahlung (> 0) bzw. -Erstattung an den Mieter (< 0) zu einem Abrechnungsjahr.
export async function addNkSettlementReceiptAction(
  leaseId: string,
  settlementYear: number,
  amountCents: number,
  receivedAt: string,
  note?: string | null,
): Promise<ActionResult> {
  const user = await requireUser();

  if (!Number.isInteger(settlementYear) || settlementYear < 1990 || settlementYear > 2100) return { ok: false, error: "Ungültiges Abrechnungsjahr." };
  if (!Number.isInteger(amountCents) || amountCents === 0) return { ok: false, error: "Betrag darf nicht 0 sein." };
  if (!DATE_RE.test(receivedAt)) return { ok: false, error: "Ungültiges Datum." };

  const lease = await db.query.leases.findFirst({ where: and(eq(leases.id, leaseId), isNull(leases.deletedAt)) });
  if (!lease) return { ok: false, error: "Mietvertrag nicht gefunden." };

  const id = createId();
  await db.insert(paymentReceipts).values({
    id, leaseId, kind: "nk_settlement", settlementYear, receivedAt, amountCents, note: note?.trim() || null,
  });
  await writeAuditLog({ userId: user.id, action: "receipt.create", entity: "payment_receipt", entityId: id, after: { leaseId, kind: "nk_settlement", settlementYear, amountCents, receivedAt } });

  revalidatePath(`/leases/${leaseId}`);
  revalidatePath("/service-charges", "layout");
  revalidatePath("/tax");
  return { ok: true };
}

export async function deleteReceiptAction(receiptId: string): Promise<ActionResult> {
  const user = await requireUser();

  const r = await db.query.paymentReceipts.findFirst({ where: eq(paymentReceipts.id, receiptId) });
  if (!r || r.deletedAt) return { ok: false, error: "Eingang nicht gefunden." };

  await db.update(paymentReceipts).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(paymentReceipts.id, receiptId));
  if (r.paymentId) await syncPaymentFromReceipts(r.paymentId);

  await writeAuditLog({ userId: user.id, action: "receipt.delete", entity: "payment_receipt", entityId: receiptId, before: r as Record<string, unknown> });

  revalidatePaymentViews(r.leaseId);
  if (r.paymentId) revalidatePath(`/payments/${r.paymentId}/edit`);
  revalidatePath("/service-charges", "layout");
  revalidatePath("/tax");
  return { ok: true };
}

export async function getNkSettlementReceiptsAction(leaseId: string, settlementYear: number) {
  await requireUser();
  return db.query.paymentReceipts.findMany({
    where: and(
      eq(paymentReceipts.leaseId, leaseId),
      eq(paymentReceipts.kind, "nk_settlement"),
      eq(paymentReceipts.settlementYear, settlementYear),
      isNull(paymentReceipts.deletedAt),
    ),
    orderBy: [asc(paymentReceipts.receivedAt)],
  });
}

// Mietkonto eines Vertrags: Soll je fälligem Monat gegen alle Mieteingänge,
// chronologisch mit laufendem Saldo; dazu NK-Nachzahlungen/-Erstattungen separat.
export async function getRentLedgerAction(leaseId: string) {
  await requireUser();
  const [pays, receipts] = await Promise.all([
    db.query.payments.findMany({ where: and(eq(payments.leaseId, leaseId), isNull(payments.deletedAt)) }),
    db.query.paymentReceipts.findMany({
      where: and(eq(paymentReceipts.leaseId, leaseId), isNull(paymentReceipts.deletedAt)),
      orderBy: [asc(paymentReceipts.receivedAt)],
    }),
  ]);
  const activePaymentIds = new Set(pays.map((p) => p.id));
  const rentReceipts = receipts.filter((r) => r.kind === "rent" && r.paymentId && activePaymentIds.has(r.paymentId));
  const ledger = buildRentLedger({
    payments: pays,
    receipts: rentReceipts.map((r) => ({ paymentId: r.paymentId, receivedAt: r.receivedAt, amountCents: r.amountCents, note: r.note })),
    asOf: todayLocal(),
  });
  const nkReceipts = receipts.filter((r) => r.kind === "nk_settlement");
  return { ledger, nkReceipts };
}

// Teilzahlung erfassen: addiert den Betrag zum bestehenden paidCents.
// Sobald die Summe ≥ Soll erreicht, gilt der Eintrag als vollständig bezahlt.
export async function addPartialPaymentAction(
  id: string,
  amountCents: number,
  receivedAt: string,
): Promise<ActionResult> {
  const user = await requireUser();

  if (!Number.isInteger(amountCents) || amountCents <= 0) return { ok: false, error: "Betrag muss > 0 sein." };
  if (!DATE_RE.test(receivedAt)) return { ok: false, error: "Ungültiges Datum." };

  const payment = await db.query.payments.findFirst({ where: eq(payments.id, id) });
  if (!payment || payment.deletedAt) return { ok: false, error: "Zahlung nicht gefunden." };

  await db.insert(paymentReceipts).values({
    id: createId(), leaseId: payment.leaseId, kind: "rent", paymentId: id, receivedAt, amountCents,
  });
  await syncPaymentFromReceipts(id);

  await writeAuditLog({
    userId: user.id,
    action: "payment.partial",
    entity: "payment",
    entityId: id,
    before: payment as Record<string, unknown>,
    after: { addedCents: amountCents, receivedAt },
  });

  revalidatePaymentViews(payment.leaseId);
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

  // Alle Eingänge dieses Monats zurücknehmen (Soft-Delete, im Audit nachvollziehbar)
  await db.update(paymentReceipts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(paymentReceipts.paymentId, id), isNull(paymentReceipts.deletedAt)));
  await syncPaymentFromReceipts(id);

  await writeAuditLog({ userId: user.id, action: "payment.unpaid", entity: "payment", entityId: id, before: payment as Record<string, unknown>, after: { paidCents: null, paidAt: null } });

  revalidatePaymentViews(payment.leaseId);
  return { ok: true };
}

// Bearbeiten eines Monats: nur die Notiz. Beträge/Daten laufen über die Eingänge.
export async function updatePaymentNotesAction(id: string, notes: string | null): Promise<ActionResult> {
  const user = await requireUser();

  const before = await db.query.payments.findFirst({ where: eq(payments.id, id) });
  if (!before || before.deletedAt) return { ok: false, error: "Zahlung nicht gefunden." };

  const value = notes?.trim() || null;
  await db.update(payments).set({ notes: value, updatedAt: new Date() }).where(eq(payments.id, id));

  await writeAuditLog({ userId: user.id, action: "payment.update", entity: "payment", entityId: id, before: before as Record<string, unknown>, after: { notes: value } });

  revalidatePaymentViews(before.leaseId);
  return { ok: true };
}

export async function deletePaymentAction(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const payment = await db.query.payments.findFirst({ where: eq(payments.id, id) });
  if (!payment || payment.deletedAt) return { ok: false, error: "Zahlung nicht gefunden." };

  await db.update(payments).set({ deletedAt: new Date() }).where(eq(payments.id, id));
  // Eingänge des gelöschten Monats ebenfalls entfernen (zählen sonst in der Anlage V)
  await db.update(paymentReceipts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(paymentReceipts.paymentId, id), isNull(paymentReceipts.deletedAt)));

  await writeAuditLog({ userId: user.id, action: "payment.delete", entity: "payment", entityId: id, before: payment as Record<string, unknown> });

  revalidatePaymentViews(payment.leaseId);
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
      receipts: {
        where: isNull(paymentReceipts.deletedAt),
        orderBy: [asc(paymentReceipts.receivedAt)],
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
      receipts: {
        where: isNull(paymentReceipts.deletedAt),
        orderBy: [asc(paymentReceipts.receivedAt)],
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
