import { notFound } from "next/navigation";
import { getLeaseAction } from "@/server/actions/leases";
import { getUnitsWithPropertyAction } from "@/server/actions/units";
import { getTenantsForLeasePickerAction } from "@/server/actions/tenants";
import { LeaseForm } from "@/components/lease/lease-form";
import { toEuros } from "@/lib/money";
import type { LeaseFormInput, RentComponentKind } from "@/lib/validators/lease";

export const metadata = { title: "Mietvertrag bearbeiten – Domora" };

export default async function EditLeasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [lease, unitsRaw, tenants] = await Promise.all([
    getLeaseAction(id),
    getUnitsWithPropertyAction(),
    getTenantsForLeasePickerAction(),
  ]);

  if (!lease || lease.deletedAt) notFound();

  const units = unitsRaw.map((u) => ({
    id: u.id,
    label: `${u.name} – ${u.property.street}, ${u.property.city}`,
  }));

  const depositMode = lease.depositFactor != null ? "factor" : "fixed";
  const defaultValues: LeaseFormInput = {
    unitId: lease.unitId,
    tenantIds: lease.leaseTenants.map((lt) => lt.tenantId),
    startDate: lease.startDate,
    endDate: lease.endDate ?? "",
    rentEur: toEuros(lease.rentCents),
    serviceChargesEur: lease.serviceChargesCents != null ? toEuros(lease.serviceChargesCents) : undefined,
    depositMode,
    depositEur: depositMode === "fixed" && lease.depositCents != null ? toEuros(lease.depositCents) : undefined,
    depositFactor: lease.depositFactor ?? undefined,
    rentType: lease.rentType,
    rentComponents: (lease.rentComponents ?? []).map((c) => ({
      kind: c.kind as RentComponentKind,
      description: c.description ?? "",
      amountEur: toEuros(c.amountCents),
    })),
    notes: lease.notes ?? undefined,
  };

  const tenantNames = lease.leaseTenants
    .map((lt) => `${lt.tenant.firstName} ${lt.tenant.lastName}`)
    .join(" · ");

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Mietvertrag bearbeiten</h1>
      <p className="text-muted-foreground mb-6">
        {lease.unit.name} · {tenantNames}
      </p>
      <LeaseForm mode="edit" leaseId={id} units={units} tenants={tenants} defaultValues={defaultValues} />
    </div>
  );
}
