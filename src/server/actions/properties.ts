"use server";

import { createId } from "@paralleldrive/cuid2";
import { eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { properties } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { toCents } from "@/lib/money";
import { propertySchema, type PropertyFormInput } from "@/lib/validators/property";
import { writeAuditLog } from "@/lib/audit";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createPropertyAction(data: PropertyFormInput): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = propertySchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const { purchasePriceTotalEur, purchasePriceLandEur, depreciationRate, referenceRentEurPerSqm, ...rest } = parsed.data;
  const id = createId();

  await db.insert(properties).values({
    id,
    ...rest,
    purchasePriceTotal: purchasePriceTotalEur != null ? toCents(purchasePriceTotalEur) : null,
    purchasePriceLand: purchasePriceLandEur != null ? toCents(purchasePriceLandEur) : null,
    depreciationPermille: Math.round(depreciationRate * 10),
    referenceRentCentsPerSqm: referenceRentEurPerSqm != null ? toCents(referenceRentEurPerSqm) : null,
  });

  await writeAuditLog({ userId: user.id, action: "property.create", entity: "property", entityId: id, after: { ...rest, depreciationRate } });

  revalidatePath("/properties");
  return { ok: true };
}

export async function updatePropertyAction(id: string, data: PropertyFormInput): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = propertySchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const before = await db.query.properties.findFirst({ where: eq(properties.id, id) });
  if (!before || before.deletedAt) return { ok: false, error: "Objekt nicht gefunden." };

  const { purchasePriceTotalEur, purchasePriceLandEur, depreciationRate, referenceRentEurPerSqm, ...rest } = parsed.data;

  await db.update(properties).set({
    ...rest,
    purchasePriceTotal: purchasePriceTotalEur != null ? toCents(purchasePriceTotalEur) : null,
    purchasePriceLand: purchasePriceLandEur != null ? toCents(purchasePriceLandEur) : null,
    depreciationPermille: Math.round(depreciationRate * 10),
    referenceRentCentsPerSqm: referenceRentEurPerSqm != null ? toCents(referenceRentEurPerSqm) : null,
    updatedAt: new Date(),
  }).where(eq(properties.id, id));

  await writeAuditLog({ userId: user.id, action: "property.update", entity: "property", entityId: id, before: before as Record<string, unknown>, after: { ...rest, depreciationRate } });

  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  return { ok: true };
}

export async function deletePropertyAction(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const property = await db.query.properties.findFirst({ where: eq(properties.id, id) });
  if (!property || property.deletedAt) return { ok: false, error: "Objekt nicht gefunden." };

  await db.update(properties).set({ deletedAt: new Date() }).where(eq(properties.id, id));

  await writeAuditLog({ userId: user.id, action: "property.delete", entity: "property", entityId: id, before: property as Record<string, unknown> });

  revalidatePath("/properties");
  return { ok: true };
}

export async function getPropertiesAction() {
  await requireUser();
  return db.query.properties.findMany({
    where: isNull(properties.deletedAt),
    orderBy: (p, { asc }) => [asc(p.city), asc(p.street)],
    with: {
      units: {
        where: (u, { isNull }) => isNull(u.deletedAt),
        orderBy: (u, { asc }) => [asc(u.floor), asc(u.name)],
        with: {
          leases: {
            where: (l, { isNull }) => isNull(l.deletedAt),
            orderBy: (l, { desc }) => [desc(l.startDate)],
            with: {
              leaseTenants: {
                with: { tenant: true },
                orderBy: (lt, { asc }) => [asc(lt.sortOrder)],
              },
            },
          },
        },
      },
    },
  });
}

export async function getPropertyAction(id: string) {
  await requireUser();
  return db.query.properties.findFirst({
    where: eq(properties.id, id),
    with: {
      units: { where: (u, { isNull }) => isNull(u.deletedAt), orderBy: (u, { asc }) => [asc(u.floor), asc(u.name)] },
    },
  });
}
