"use server";

import { createId } from "@paralleldrive/cuid2";
import { eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { tenantSchema, type TenantFormInput } from "@/lib/validators/tenant";
import { writeAuditLog } from "@/lib/audit";
import { todayLocal } from "@/lib/dates";

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

