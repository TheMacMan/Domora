"use server";

import { createId } from "@paralleldrive/cuid2";
import { eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leases, leaseTenants, leaseRentComponents } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { toCents } from "@/lib/money";
import { leaseSchema, type LeaseFormInput, type RentComponentInput } from "@/lib/validators/lease";
import { writeAuditLog } from "@/lib/audit";

type ActionResult = { ok: true } | { ok: false; error: string };

function toDb(data: LeaseFormInput) {
  const rentCents = toCents(data.rentEur);
  const isFactor = (data.depositMode ?? "fixed") === "factor";
  const depositFactor = isFactor ? (data.depositFactor ?? null) : null;
  const depositCents = isFactor
    ? (depositFactor != null ? Math.round(rentCents * depositFactor) : null)
    : (data.depositEur != null ? toCents(data.depositEur) : null);

  return {
    unitId: data.unitId,
    startDate: data.startDate,
    endDate: data.endDate || null,
    rentCents,
    serviceChargesCents: data.serviceChargesEur != null ? toCents(data.serviceChargesEur) : null,
    depositCents,
    depositFactor,
    rentType: data.rentType,
    notes: data.notes ?? null,
  };
}

async function insertLeaseTenants(leaseId: string, tenantIds: string[]) {
  for (let i = 0; i < tenantIds.length; i++) {
    await db.insert(leaseTenants).values({
      id: createId(),
      leaseId,
      tenantId: tenantIds[i]!,
      sortOrder: i,
    });
  }
}

async function syncRentComponents(leaseId: string, components: RentComponentInput[] = []) {
  // Komplett neu schreiben: alte hart-löschen, neue einfügen.
  // Components haben keine semantische Stabilität (kein referenzierender Bezug),
  // daher kein Soft-Delete notwendig.
  await db.delete(leaseRentComponents).where(eq(leaseRentComponents.leaseId, leaseId));
  for (const c of components) {
    if (c.amountEur == null || c.amountEur <= 0) continue;
    await db.insert(leaseRentComponents).values({
      id: createId(),
      leaseId,
      kind: c.kind,
      description: c.description || null,
      amountCents: toCents(c.amountEur),
    });
  }
}

export async function createLeaseAction(data: LeaseFormInput): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = leaseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const id = createId();
  await db.insert(leases).values({ id, ...toDb(parsed.data) });
  await insertLeaseTenants(id, parsed.data.tenantIds);
  await syncRentComponents(id, parsed.data.rentComponents);

  await writeAuditLog({ userId: user.id, action: "lease.create", entity: "lease", entityId: id, after: parsed.data });

  revalidatePath("/leases");
  return { ok: true };
}

export async function updateLeaseAction(id: string, data: LeaseFormInput): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = leaseSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const before = await db.query.leases.findFirst({ where: eq(leases.id, id) });
  if (!before || before.deletedAt) return { ok: false, error: "Mietvertrag nicht gefunden." };

  await db.update(leases).set({ ...toDb(parsed.data), updatedAt: new Date() }).where(eq(leases.id, id));

  await db.delete(leaseTenants).where(eq(leaseTenants.leaseId, id));
  await insertLeaseTenants(id, parsed.data.tenantIds);
  await syncRentComponents(id, parsed.data.rentComponents);

  await writeAuditLog({ userId: user.id, action: "lease.update", entity: "lease", entityId: id, before: before as Record<string, unknown>, after: parsed.data });

  revalidatePath("/leases");
  revalidatePath(`/leases/${id}`);
  return { ok: true };
}

export async function deleteLeaseAction(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const lease = await db.query.leases.findFirst({ where: eq(leases.id, id) });
  if (!lease || lease.deletedAt) return { ok: false, error: "Mietvertrag nicht gefunden." };

  await db.update(leases).set({ deletedAt: new Date() }).where(eq(leases.id, id));

  await writeAuditLog({ userId: user.id, action: "lease.delete", entity: "lease", entityId: id, before: lease as Record<string, unknown> });

  revalidatePath("/leases");
  return { ok: true };
}

export async function getLeasesAction() {
  await requireUser();
  return db.query.leases.findMany({
    where: isNull(leases.deletedAt),
    orderBy: (l, { desc }) => [desc(l.startDate)],
    with: {
      unit: { with: { property: true } },
      leaseTenants: {
        with: { tenant: true },
        orderBy: (lt, { asc }) => [asc(lt.sortOrder)],
      },
      rentComponents: true,
      rentAdjustments: {
        where: (r, { isNull }) => isNull(r.deletedAt),
        orderBy: (r, { asc }) => [asc(r.effectiveDate)],
      },
    },
  });
}

export async function getLeaseAction(id: string) {
  await requireUser();
  return db.query.leases.findFirst({
    where: eq(leases.id, id),
    with: {
      unit: { with: { property: true } },
      leaseTenants: {
        with: { tenant: true },
        orderBy: (lt, { asc }) => [asc(lt.sortOrder)],
      },
      rentAdjustments: {
        where: (r, { isNull }) => isNull(r.deletedAt),
        orderBy: (r, { asc }) => [asc(r.effectiveDate)],
      },
      rentComponents: true,
    },
  });
}
