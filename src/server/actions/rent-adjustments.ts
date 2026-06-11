"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, asc, eq, gte, isNull, lte, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { rentAdjustments, payments, leases } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { toCents } from "@/lib/money";
import { rentAdjustmentSchema, type RentAdjustmentFormInput } from "@/lib/validators/rent-adjustment";
import { writeAuditLog } from "@/lib/audit";
import { effectiveRentAt } from "@/lib/rent";

// Aktualisiert alle bereits generierten, NOCH UNBEZAHLTEN Payments eines Mietvertrags
// ab dem angegebenen Stichtag (inkl.) auf die aktuell gültige Miete (Kalt + NK + Komponenten).
// Wird nach jeder Erstellung/Löschung einer Mietanpassung aufgerufen.
async function recalcUnpaidPaymentsFromDate(leaseId: string, fromDate: string) {
  const lease = await db.query.leases.findFirst({
    where: eq(leases.id, leaseId),
    with: { rentComponents: true },
  });
  if (!lease) return 0;

  const allAdjustments = await db.query.rentAdjustments.findMany({
    where: and(eq(rentAdjustments.leaseId, leaseId), isNull(rentAdjustments.deletedAt)),
  });

  const affected = await db.query.payments.findMany({
    where: and(
      eq(payments.leaseId, leaseId),
      isNull(payments.deletedAt),
      isNull(payments.paidAt),
      gte(payments.dueDate, fromDate),
    ),
  });

  const componentsCents = lease.rentComponents.reduce((s, c) => s + c.amountCents, 0);
  let count = 0;
  for (const p of affected) {
    const { rentCents: baseRent, serviceChargesCents: effSC } = effectiveRentAt(lease, allAdjustments, p.dueDate);
    const newRent = baseRent + componentsCents;
    const newSC = effSC;
    if (p.rentCents === newRent && p.serviceChargesCents === newSC) continue;
    await db.update(payments).set({ rentCents: newRent, serviceChargesCents: newSC, updatedAt: new Date() }).where(eq(payments.id, p.id));
    count++;
  }
  return count;
}

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createRentAdjustmentAction(
  leaseId: string,
  data: RentAdjustmentFormInput
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = rentAdjustmentSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const id = createId();
  await db.insert(rentAdjustments).values({
    id,
    leaseId,
    effectiveDate: parsed.data.effectiveDate,
    rentCents: toCents(parsed.data.rentEur),
    serviceChargesCents: parsed.data.serviceChargesEur != null ? toCents(parsed.data.serviceChargesEur) : null,
    reason: parsed.data.reason ?? null,
  });

  await writeAuditLog({
    userId: user.id,
    action: "rent_adjustment.create",
    entity: "rent_adjustment",
    entityId: id,
    after: parsed.data,
  });

  // Bereits generierte unbezahlte Payments ab Stichtag mit neuer Miete aktualisieren
  await recalcUnpaidPaymentsFromDate(leaseId, parsed.data.effectiveDate);

  revalidatePath(`/leases/${leaseId}`);
  revalidatePath("/payments");
  return { ok: true };
}

export async function deleteRentAdjustmentAction(id: string, leaseId: string): Promise<ActionResult> {
  const user = await requireUser();

  const adj = await db.query.rentAdjustments.findFirst({ where: eq(rentAdjustments.id, id) });
  if (!adj || adj.deletedAt) return { ok: false, error: "Eintrag nicht gefunden." };

  await db.update(rentAdjustments).set({ deletedAt: new Date() }).where(eq(rentAdjustments.id, id));

  await writeAuditLog({
    userId: user.id,
    action: "rent_adjustment.delete",
    entity: "rent_adjustment",
    entityId: id,
    before: adj as Record<string, unknown>,
  });

  // Unbezahlte Payments ab dem Stichtag der gelöschten Anpassung auf vorherigen Stand zurücksetzen
  await recalcUnpaidPaymentsFromDate(leaseId, adj.effectiveDate);

  revalidatePath(`/leases/${leaseId}`);
  revalidatePath("/payments");
  return { ok: true };
}

export async function getRentAdjustmentsForLeaseAction(leaseId: string) {
  await requireUser();
  return db.query.rentAdjustments.findMany({
    where: and(eq(rentAdjustments.leaseId, leaseId), isNull(rentAdjustments.deletedAt)),
    orderBy: [asc(rentAdjustments.effectiveDate)],
  });
}

// Gibt den effektiven Mietbetrag für ein gegebenes Datum zurück.
export async function getEffectiveRentAction(leaseId: string, atDate: string) {
  await requireUser();
  return db.query.rentAdjustments.findFirst({
    where: and(
      eq(rentAdjustments.leaseId, leaseId),
      lte(rentAdjustments.effectiveDate, atDate),
      isNull(rentAdjustments.deletedAt)
    ),
    orderBy: [desc(rentAdjustments.effectiveDate)],
  });
}
