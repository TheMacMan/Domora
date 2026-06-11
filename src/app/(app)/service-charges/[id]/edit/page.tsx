import { notFound } from "next/navigation";
import { getNkAbrechnungAction } from "@/server/actions/service-charges";
import { NkAbrechnungEditForm } from "@/components/service-charges/edit-form";

export const metadata = { title: "NK-Abrechnung bearbeiten – Domora" };

export default async function NkAbrechnungEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const abr = await getNkAbrechnungAction(id);
  if (!abr) notFound();
  if (abr.status === "finalized") notFound();

  // Aufschlüsselung pro Kategorie → Lease-Positionen für UI
  type LeasePos = {
    leaseAbrechnungId: string;
    unitName: string;
    tenants: string;
    monthsActive: number;
    consumptionValue: number | null;
  };
  type CategoryGroup = {
    category: string;
    totalCostsCents: number;
    distributionKey: string;
    mixConsumptionPermille: number | null;
    leasePositions: LeasePos[];
  };

  const byCategory = new Map<string, CategoryGroup>();
  for (const la of abr.leaseAbrechnungen) {
    const tenants = la.lease.leaseTenants.map((lt) => `${lt.tenant.lastName}, ${lt.tenant.firstName}`).join(" · ");
    for (const p of la.positionen) {
      const existing = byCategory.get(p.category);
      if (existing) {
        existing.leasePositions.push({
          leaseAbrechnungId: la.id,
          unitName: la.unit.name,
          tenants,
          monthsActive: la.monthsActive,
          consumptionValue: p.consumptionValue,
        });
      } else {
        byCategory.set(p.category, {
          category: p.category,
          totalCostsCents: p.totalCostsCents,
          distributionKey: p.distributionKey,
          mixConsumptionPermille: p.mixConsumptionPermille,
          leasePositions: [{
            leaseAbrechnungId: la.id,
            unitName: la.unit.name,
            tenants,
            monthsActive: la.monthsActive,
            consumptionValue: p.consumptionValue,
          }],
        });
      }
    }
  }
  const categories = Array.from(byCategory.values()).sort((a, b) => a.category.localeCompare(b.category));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">NK-Abrechnung {abr.year} bearbeiten</h1>
        <p className="text-muted-foreground mt-1">
          {abr.property.street}, {abr.property.city} · Verteilerschlüssel pro Kategorie anpassen
        </p>
      </div>
      <NkAbrechnungEditForm abrechnungId={abr.id} categories={categories} />
    </div>
  );
}
