"use server";

import { createId } from "@paralleldrive/cuid2";
import { eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { units } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { unitSchema, type UnitFormInput } from "@/lib/validators/unit";
import { writeAuditLog } from "@/lib/audit";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createUnitAction(propertyId: string, data: UnitFormInput): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = unitSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const id = createId();
  await db.insert(units).values({ id, propertyId, ...parsed.data });

  await writeAuditLog({ userId: user.id, action: "unit.create", entity: "unit", entityId: id, after: { propertyId, ...parsed.data } });

  revalidatePath(`/properties/${propertyId}`);
  return { ok: true };
}

export async function updateUnitAction(id: string, data: UnitFormInput): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = unitSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const before = await db.query.units.findFirst({ where: eq(units.id, id) });
  if (!before || before.deletedAt) return { ok: false, error: "Wohneinheit nicht gefunden." };

  await db.update(units).set({ ...parsed.data, updatedAt: new Date() }).where(eq(units.id, id));

  await writeAuditLog({ userId: user.id, action: "unit.update", entity: "unit", entityId: id, before: before as Record<string, unknown>, after: parsed.data });

  revalidatePath(`/properties/${before.propertyId}`);
  return { ok: true };
}

export async function deleteUnitAction(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const unit = await db.query.units.findFirst({ where: eq(units.id, id) });
  if (!unit || unit.deletedAt) return { ok: false, error: "Wohneinheit nicht gefunden." };

  await db.update(units).set({ deletedAt: new Date() }).where(eq(units.id, id));

  await writeAuditLog({ userId: user.id, action: "unit.delete", entity: "unit", entityId: id, before: unit as Record<string, unknown> });

  revalidatePath("/properties");
  revalidatePath(`/properties/${unit.propertyId}`);
  return { ok: true };
}

export async function getUnitAction(id: string) {
  await requireUser();
  return db.query.units.findFirst({ where: eq(units.id, id) });
}

export async function getUnitsWithPropertyAction() {
  await requireUser();
  return db.query.units.findMany({
    where: isNull(units.deletedAt),
    orderBy: (u, { asc }) => [asc(u.name)],
    with: { property: true },
  });
}
