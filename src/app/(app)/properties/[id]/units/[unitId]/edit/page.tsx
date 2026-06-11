import { notFound } from "next/navigation";
import { getPropertyAction } from "@/server/actions/properties";
import { getUnitAction } from "@/server/actions/units";
import { UnitForm } from "@/components/unit/unit-form";
import type { UnitFormInput } from "@/lib/validators/unit";

export const metadata = { title: "Wohneinheit bearbeiten – Domora" };

export default async function EditUnitPage({ params }: { params: Promise<{ id: string; unitId: string }> }) {
  const { id, unitId } = await params;
  const [property, unit] = await Promise.all([getPropertyAction(id), getUnitAction(unitId)]);

  if (!property || property.deletedAt) notFound();
  if (!unit || unit.deletedAt) notFound();

  const defaultValues: UnitFormInput = {
    name: unit.name,
    floor: unit.floor ?? undefined,
    livingArea: unit.livingArea,
    notes: unit.notes ?? undefined,
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Wohneinheit bearbeiten</h1>
      <p className="text-muted-foreground mb-6">{unit.name} · {property.street}, {property.postalCode} {property.city}</p>
      <UnitForm mode="edit" propertyId={id} unitId={unitId} defaultValues={defaultValues} />
    </div>
  );
}
