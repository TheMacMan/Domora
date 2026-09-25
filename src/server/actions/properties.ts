"use server";

import { createId } from "@paralleldrive/cuid2";
import { eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { properties, propertyDepreciationItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { toCents } from "@/lib/money";
import { propertySchema, type PropertyFormInput } from "@/lib/validators/property";
import { depreciationItemSchema, type DepreciationItemInput } from "@/lib/validators/depreciation";
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

// ── AfA-Posten (ELSTER Anlage V, Zeile 33) ─────────────────────────────────

function depreciationToDb(d: DepreciationItemInput) {
  return {
    method: d.method,
    rateBps: d.ratePercent != null ? Math.round(d.ratePercent * 100) : null,
    basisMode: d.basisMode,
    explanation: d.basisMode === "explanation" ? d.explanation?.trim() || null : null,
    annualCents: toCents(d.annualEur),
    fromYear: d.fromYear ?? null,
    toYear: d.toYear ?? null,
  };
}

function revalidateDepreciation(propertyId: string) {
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/tax");
}

export async function createDepreciationItemAction(propertyId: string, data: DepreciationItemInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = depreciationItemSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };

  const property = await db.query.properties.findFirst({ where: eq(properties.id, propertyId) });
  if (!property || property.deletedAt) return { ok: false, error: "Objekt nicht gefunden." };

  const id = createId();
  const values = depreciationToDb(parsed.data);
  await db.insert(propertyDepreciationItems).values({ id, propertyId, ...values });
  await writeAuditLog({ userId: user.id, action: "depreciation_item.create", entity: "property_depreciation_item", entityId: id, after: { propertyId, ...values } });

  revalidateDepreciation(propertyId);
  return { ok: true };
}

export async function updateDepreciationItemAction(id: string, data: DepreciationItemInput): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = depreciationItemSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." };

  const before = await db.query.propertyDepreciationItems.findFirst({ where: eq(propertyDepreciationItems.id, id) });
  if (!before || before.deletedAt) return { ok: false, error: "AfA-Posten nicht gefunden." };

  const values = depreciationToDb(parsed.data);
  await db.update(propertyDepreciationItems).set({ ...values, updatedAt: new Date() }).where(eq(propertyDepreciationItems.id, id));
  await writeAuditLog({ userId: user.id, action: "depreciation_item.update", entity: "property_depreciation_item", entityId: id, before: before as Record<string, unknown>, after: values });

  revalidateDepreciation(before.propertyId);
  return { ok: true };
}

export async function deleteDepreciationItemAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const item = await db.query.propertyDepreciationItems.findFirst({ where: eq(propertyDepreciationItems.id, id) });
  if (!item || item.deletedAt) return { ok: false, error: "AfA-Posten nicht gefunden." };

  await db.update(propertyDepreciationItems).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(propertyDepreciationItems.id, id));
  await writeAuditLog({ userId: user.id, action: "depreciation_item.delete", entity: "property_depreciation_item", entityId: id, before: item as Record<string, unknown> });

  revalidateDepreciation(item.propertyId);
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
      depreciationItems: {
        where: (d, { isNull }) => isNull(d.deletedAt),
        orderBy: (d, { asc }) => [asc(d.createdAt)],
      },
    },
  });
}
