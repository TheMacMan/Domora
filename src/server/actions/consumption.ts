"use server";

import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { consumptionPeriods, properties } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { toCents } from "@/lib/money";
import { consumptionPeriodSchema, type ConsumptionPeriodInput } from "@/lib/validators/consumption";

type ActionResult = { ok: true } | { ok: false; error: string };

function toDb(d: ConsumptionPeriodInput) {
  return {
    medium: d.medium,
    periodStart: d.periodStart,
    periodEnd: d.periodEnd,
    quantity: d.quantity,
    costCents: d.costEur != null ? toCents(d.costEur) : null,
    advanceCents: d.advanceEur != null ? toCents(d.advanceEur) : null,
    note: d.note?.trim() || null,
  };
}

export async function createConsumptionPeriodAction(propertyId: string, data: ConsumptionPeriodInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = consumptionPeriodSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };

  const property = await db.query.properties.findFirst({ where: eq(properties.id, propertyId) });
  if (!property || property.deletedAt) return { ok: false, error: "Objekt nicht gefunden." };

  const id = createId();
  const values = toDb(parsed.data);
  await db.insert(consumptionPeriods).values({ id, propertyId, ...values });
  await writeAuditLog({ userId: user.id, action: "consumption_period.create", entity: "consumption_period", entityId: id, after: { propertyId, ...values } });

  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

export async function updateConsumptionPeriodAction(id: string, data: ConsumptionPeriodInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = consumptionPeriodSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };

  const before = await db.query.consumptionPeriods.findFirst({ where: eq(consumptionPeriods.id, id) });
  if (!before || before.deletedAt) return { ok: false, error: "Verbrauchseintrag nicht gefunden." };

  const values = toDb(parsed.data);
  await db.update(consumptionPeriods).set({ ...values, updatedAt: new Date() }).where(eq(consumptionPeriods.id, id));
  await writeAuditLog({ userId: user.id, action: "consumption_period.update", entity: "consumption_period", entityId: id, before: before as Record<string, unknown>, after: values });

  revalidatePath(`/properties/${before.propertyId}`);
  return { ok: true };
}

export async function deleteConsumptionPeriodAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const before = await db.query.consumptionPeriods.findFirst({ where: eq(consumptionPeriods.id, id) });
  if (!before || before.deletedAt) return { ok: false, error: "Verbrauchseintrag nicht gefunden." };

  await db.update(consumptionPeriods).set({ deletedAt: new Date() }).where(eq(consumptionPeriods.id, id));
  await writeAuditLog({ userId: user.id, action: "consumption_period.delete", entity: "consumption_period", entityId: id, before: before as Record<string, unknown> });

  revalidatePath(`/properties/${before.propertyId}`);
  return { ok: true };
}
