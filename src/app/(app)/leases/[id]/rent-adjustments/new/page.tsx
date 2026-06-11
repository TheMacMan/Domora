import { todayLocal } from "@/lib/dates";
import { notFound } from "next/navigation";
import { getLeaseAction } from "@/server/actions/leases";
import { RentAdjustmentForm } from "@/components/lease/rent-adjustment-form";
import { toEuros, formatMoney } from "@/lib/money";

export const metadata = { title: "Mietanpassung erfassen – Domora" };

export default async function NewRentAdjustmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lease = await getLeaseAction(id);

  if (!lease || lease.deletedAt) notFound();

  const today = todayLocal();
  const currentAdj = [...lease.rentAdjustments].reverse().find((a) => a.effectiveDate <= today);
  const currentRentCents = currentAdj?.rentCents ?? lease.rentCents;
  const currentSCCents = currentAdj?.serviceChargesCents ?? lease.serviceChargesCents;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Mietanpassung erfassen</h1>
      <p className="text-muted-foreground mb-1">
        {lease.unit.name} · {lease.leaseTenants.map((lt) => `${lt.tenant.firstName} ${lt.tenant.lastName}`).join(" · ")}
      </p>
      <p className="text-sm text-muted-foreground mb-6">
        Aktuelle Kaltmiete: <span className="font-medium text-foreground">{formatMoney(currentRentCents)}</span>
        {currentSCCents != null && (
          <> + <span className="font-medium text-foreground">{formatMoney(currentSCCents)}</span> NK</>
        )}
      </p>
      <RentAdjustmentForm
        leaseId={id}
        currentRentEur={toEuros(currentRentCents)}
        currentServiceChargesEur={currentSCCents != null ? toEuros(currentSCCents) : undefined}
      />
    </div>
  );
}
