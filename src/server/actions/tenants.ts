"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { payments, tenants } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { tenantSchema, type TenantFormInput } from "@/lib/validators/tenant";
import { writeAuditLog } from "@/lib/audit";
import { todayLocal } from "@/lib/dates";
import { effectiveRentAt } from "@/lib/rent";
import { tenantStatus } from "@/lib/tenant-overview";

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

export async function createTenantAction(data: TenantFormInput): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = tenantSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const { email, phone, ...rest } = parsed.data;
  const id = createId();

  await db.insert(tenants).values({
    id,
    ...rest,
    email: email || null,
    phone: phone || null,
  });

  await writeAuditLog({ userId: user.id, action: "tenant.create", entity: "tenant", entityId: id, after: parsed.data });

  revalidatePath("/tenants");
  return { ok: true, id };
}

export async function updateTenantAction(id: string, data: TenantFormInput): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = tenantSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: "Ungültige Eingabe." };

  const before = await db.query.tenants.findFirst({ where: eq(tenants.id, id) });
  if (!before || before.deletedAt) return { ok: false, error: "Mieter nicht gefunden." };

  const { email, phone, ...rest } = parsed.data;

  await db.update(tenants).set({
    ...rest,
    email: email || null,
    phone: phone || null,
    updatedAt: new Date(),
  }).where(eq(tenants.id, id));

  await writeAuditLog({ userId: user.id, action: "tenant.update", entity: "tenant", entityId: id, before: before as Record<string, unknown>, after: parsed.data });

  revalidatePath("/tenants");
  revalidatePath(`/tenants/${id}`);
  return { ok: true };
}

export async function deleteTenantAction(id: string): Promise<ActionResult> {
  const user = await requireUser();

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, id) });
  if (!tenant || tenant.deletedAt) return { ok: false, error: "Mieter nicht gefunden." };

  await db.update(tenants).set({ deletedAt: new Date() }).where(eq(tenants.id, id));

  await writeAuditLog({ userId: user.id, action: "tenant.delete", entity: "tenant", entityId: id, before: tenant as Record<string, unknown> });

  revalidatePath("/tenants");
  return { ok: true };
}

export async function getTenantsAction() {
  await requireUser();
  return db.query.tenants.findMany({
    where: isNull(tenants.deletedAt),
    orderBy: (t, { asc }) => [asc(t.lastName), asc(t.firstName)],
  });
}

// Liefert Mieter mit Flag, ob mindestens ein aktiver oder zukünftiger Mietvertrag
// besteht (endDate IS NULL OR endDate >= heute). Zukünftige Verträge zählen mit,
// damit Konflikte beim Anlegen eines weiteren Vertrags sichtbar werden.
export type TenantForLeasePicker = {
  id: string;
  firstName: string;
  lastName: string;
  hasActiveLease: boolean;
};
export async function getTenantsForLeasePickerAction(): Promise<TenantForLeasePicker[]> {
  await requireUser();
  const today = todayLocal();
  const rows = await db.query.tenants.findMany({
    where: isNull(tenants.deletedAt),
    orderBy: (t, { asc }) => [asc(t.lastName), asc(t.firstName)],
    with: {
      leaseTenants: {
        with: {
          lease: { columns: { id: true, startDate: true, endDate: true, deletedAt: true } },
        },
      },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    firstName: t.firstName,
    lastName: t.lastName,
    hasActiveLease: t.leaseTenants.some((lt) => {
      const l = lt.lease;
      if (!l || l.deletedAt) return false;
      // aktiv = nicht beendet (Vertrag endet erst in der Zukunft oder unbefristet),
      // egal ob heute schon wirksam oder noch zukünftig
      return l.endDate == null || l.endDate >= today;
    }),
  }));
}

export async function getTenantAction(id: string) {
  await requireUser();
  return db.query.tenants.findFirst({ where: eq(tenants.id, id) });
}


// Mieterübersicht: Status, maßgeblicher Vertrag, aktuelle Miete und Rückstand je Mieter
export async function getTenantOverviewAction() {
  await requireUser();
  const today = todayLocal();

  const rows = await db.query.tenants.findMany({
    where: isNull(tenants.deletedAt),
    orderBy: (t, { asc }) => [asc(t.lastName), asc(t.firstName)],
    with: {
      leaseTenants: {
        with: {
          lease: {
            with: {
              unit: { with: { property: true } },
              leaseTenants: { with: { tenant: true } },
              rentAdjustments: { where: (r, { isNull }) => isNull(r.deletedAt) },
            },
          },
        },
      },
    },
  });

  // Rückstand je Vertrag: fällige Soll-Stellungen, Soll − Ist (je Monat ≥ 0)
  const duePayments = await db.query.payments.findMany({
    where: and(isNull(payments.deletedAt), lte(payments.dueDate, today)),
  });
  const arrearsByLease = new Map<string, number>();
  for (const p of duePayments) {
    const open = p.rentCents + (p.serviceChargesCents ?? 0) - (p.paidCents ?? 0);
    if (open > 0) arrearsByLease.set(p.leaseId, (arrearsByLease.get(p.leaseId) ?? 0) + open);
  }

  return rows.map((t) => {
    const leaseList = t.leaseTenants.map((lt) => lt.lease).filter((l) => l.deletedAt == null);
    const { status, lease } = tenantStatus(leaseList, today);
    const rent = lease ? effectiveRentAt(lease, lease.rentAdjustments, status === "future" ? lease.startDate : today) : null;
    return {
      id: t.id,
      firstName: t.firstName,
      lastName: t.lastName,
      email: t.email,
      phone: t.phone,
      status,
      lease: lease && {
        id: lease.id,
        startDate: lease.startDate,
        endDate: lease.endDate,
        unitName: lease.unit.name,
        propertyLabel: `${lease.unit.property.street}, ${lease.unit.property.city}`,
        coTenants: lease.leaseTenants
          .filter((lt) => lt.tenantId !== t.id)
          .map((lt) => `${lt.tenant.firstName} ${lt.tenant.lastName}`),
        rentCents: rent?.rentCents ?? 0,
        serviceChargesCents: rent?.serviceChargesCents ?? 0,
      },
      leaseCount: leaseList.length,
      arrearsCents: leaseList.reduce((s, l) => s + (arrearsByLease.get(l.id) ?? 0), 0),
    };
  });
}
