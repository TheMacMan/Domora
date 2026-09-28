import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VehicleCostForm } from "@/components/vehicles/vehicle-cost-form";
import { ReceiptsSection } from "@/components/expense/receipts-section";
import { getVehicleCostAction } from "@/server/actions/vehicles";
import { getReceiptPanelAction } from "@/server/actions/document-links";
import { getDocumentTargetsAction } from "@/server/actions/documents";

export const metadata = { title: "Fahrzeugkosten – Domora" };

export default async function VehicleCostPage({ params }: { params: Promise<{ id: string; costId: string }> }) {
  const { id, costId } = await params;
  const [cost, panel, targets] = await Promise.all([
    getVehicleCostAction(costId),
    getReceiptPanelAction("vehicle_cost", costId),
    getDocumentTargetsAction(),
  ]);
  if (!cost || cost.vehicleId !== id) notFound();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href={`/expenses/vehicles/${id}?year=${cost.date.slice(0, 4)}`}><ArrowLeft className="size-4" />{cost.vehicle.name}</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Fahrzeugkosten</h1>
      </div>
      <VehicleCostForm
        mode="edit"
        vehicleId={id}
        costId={costId}
        defaults={{
          date: cost.date,
          category: cost.category,
          amount: (cost.amountCents / 100).toFixed(2).replace(".", ","),
          description: cost.description ?? "",
          periodStart: cost.servicePeriodStart ?? "",
          periodEnd: cost.servicePeriodEnd ?? "",
          notes: cost.notes ?? "",
        }}
      />
      {panel && <ReceiptsSection targetType="vehicle_cost" targetId={costId} data={panel} targets={targets} />}
    </div>
  );
}
